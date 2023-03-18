'use client';

import type { Signer } from '@polkadot/api/types'
import type { InjectedAccount } from '@polkadot/extension-inject/types'
import type { ISubmittableResult } from '@polkadot/types/types'

import { useState, useEffect } from 'react'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { Keyring } from '@polkadot/ui-keyring'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import * as Phala from '@phala/sdk'

import styles from './page.module.css'

import abi from '../../fat_badges.json'

async function waitReady() {
  await cryptoWaitReady()
  const keyring = new Keyring()
  keyring.loadAll({ type: 'sr25519', isDevelopment: false })

  const wsProvider = new WsProvider('wss://poc5.phala.network/ws')
  const apiPromise = await ApiPromise.create(Phala.options({ provider: wsProvider, noInitWarn: true }))

  // @ts-ignore
  const injector = window.injectedWeb3['polkadot-js']
  const provider = await injector.enable('PhatContract Test')
  const accounts = await provider.accounts.get(true)

  const phatRegistry = await Phala.OnChainRegistry.create(apiPromise)

  return [apiPromise, phatRegistry, accounts, provider.signer] as [
    ApiPromise, Phala.OnChainRegistry,
    any[], Signer,
  ]
}


export default function TestButton() {
  const [apiReady, setApiReady] = useState(false)
  const [apiPromise, setApiPromise] = useState<ApiPromise | null>(null)
  const [accounts, setAccounts] = useState<InjectedAccount[]>([])
  const [signer, setSigner] = useState<Signer | null>(null)
  const [registry, setRegistry] = useState<Phala.OnChainRegistry | null>(null)
  const [contractPromise, setContractPromise] = useState<Phala.PinkContractPromise | null>(null)
  // const [account, setAccount] = useState<Keyring.Pair | null>(null)
  useEffect(() => {
    const fn = async () => {
      const [apiPromise, phatRegistry, accounts, signer] = await waitReady()
      setApiPromise(apiPromise)
      setRegistry(phatRegistry)
      const contractId = '0x9c7a829c4eb76259f94425df9325e823082ab4e97fd6bf09ee13017b32ed3c6a'
      const contractKey = await phatRegistry.getContractKey(contractId)
      if (!contractKey) {
        throw new Error('Contract not found in registry')
      }
      const contract = new Phala.PinkContractPromise(apiPromise, phatRegistry, abi, contractId, contractKey)
      setContractPromise(contract)
      setAccounts(accounts)
      setSigner(signer)
      setApiReady(true)
    }
    fn()
  }, [setApiReady, setApiPromise, setRegistry, setContractPromise, setAccounts, setSigner])

  return (
    <div className={styles.btnGroup}>
      <button
        className={styles.btn}
        disabled={!apiReady}
        onClick={async () => {
          if (!contractPromise || !accounts.length || !signer) {
            return
          }
          const cert = await Phala.signCertificate({ api: apiPromise!, signer: signer!, account: accounts[3] })
          const totalQueryResponse = await contractPromise.query.getTotalBadges(accounts[3].address, { cert })
          // @ts-ignore
          const total = totalQueryResponse.output.toJSON()
          console.log('total:', total)
        }}
      >
        query
      </button>
      <button
        className={styles.btn}
        disabled={!apiReady}
        onClick={async () => {
          if (!contractPromise || !accounts.length || !signer) {
            return
          }
          // costs estimation
          const cert = await Phala.signCertificate({ api: apiPromise!, signer: signer!, account: accounts[3] })
          const { gasRequired, storageDeposit } = await contractPromise.query.newBadge(accounts[3].address, { cert }, 'Badge01')

          // transaction / extrinct
          const options = {
              gasLimit: gasRequired.refTime.toString(),
              storageDepositLimit: storageDeposit.isCharge ? storageDeposit.asCharge : null,
          }
          const result = await new Promise(async (resolve, reject) => {
            const unsub = await contractPromise.tx.newBadge(options, 'Badge01').signAndSend(accounts[3].address, { signer }, (result: ISubmittableResult) => {
              if (result.status.isInBlock) {
                let error;
                for (const e of result.events) {
                  const { event: { data, method, section } } = e;
                  if (section === 'system' && method === 'ExtrinsicFailed') {
                    error = data[0];
                  }
                }
                // @ts-ignore
                unsub();
                if (error) {
                  reject(error);
                } else {
                  resolve({
                    hash: result.status.asInBlock.toHuman(),
                    // @ts-ignore
                    events: result.toHuman().events,
                  });
                }
              } else if (result.status.isInvalid) {
                // @ts-ignore
                unsub();
                reject('Invalid transaction');
              }
            })
          })
          console.log(result)
        }}
      >
        create
      </button>
    </div>
  )
}


