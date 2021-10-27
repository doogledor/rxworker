import { Subject, tap } from 'rxjs'
import { v4 } from 'uuid'
import { setupFlux } from './flux'
import { setupRegistry } from './registry'
import { AllOutput, AssetId2, FluxKey, IQuery, UUId } from './types'
import Worker from './worker/flux.worker?worker'
import { createObservableWebWorker } from './worker/utils/worker-utils'

export const setupRxFlux = () => {
    const command = new Subject()
    const registry = setupRegistry({ command })
    const flux = setupFlux({ command, registry })

    return {
        subscribe(query: IQuery, callback: any) {
            // TODO magic cb infer
            const uuid = registry.registerQuery(query)
            const sub = registry.makeSubscription(uuid)
            command.next({ name: 'updateQueries' })
            return sub(callback)
        },
        terminate() {
            registry.clear()
        },
    }
}
export const setupRxWorkerFlux = () => {
    const worker = new Worker()
    const registeredCallbacks: Map<UUId, any> = new Map()
    const toWorker$ = new Subject<any>()
    const fromWorker$ = createObservableWebWorker<any, [FluxKey, AllOutput][]>(
        worker,
        toWorker$
    )

    const sub = fromWorker$
        .pipe(
            tap((arr) => {
                if (arr.length) {
                    const uuid = arr[0][1].uuid
                    arr.forEach(([key, data]) => {
                        if (registeredCallbacks.has(uuid)) {
                            registeredCallbacks.get(uuid)!(
                                new Map(
                                    arr.map(([key, data]) => [
                                        key,
                                        data.payload,
                                    ])
                                )
                            )
                        }
                    })
                }
            })
        )
        .subscribe()

    return {
        subscribe(query: IQuery, callback: any) {
            // TODO magic cb infer
            const uuid = v4()
            toWorker$.next({ name: 'subscribe', data: { query, uuid } })
            registeredCallbacks.set(uuid, callback)
            return () => {
                toWorker$.next({ name: 'unsubscribe', data: { uuid } })

                registeredCallbacks.delete(uuid)
            }
        },
        terminate() {
            toWorker$.next({ name: 'terminate' })
            registeredCallbacks.clear()
            toWorker$.complete()
            sub.unsubscribe()
            worker.terminate()
        },
    }
}
