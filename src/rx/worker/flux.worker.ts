/* eslint-disable import/no-relative-parent-imports */
import {
    merge,
    Observable,
    of,
    pipe,
    Subject,
    Subscription,
    UnaryFunction,
} from 'rxjs'
import { map, concatMap, tap } from 'rxjs/operators'
import { setupFlux } from '../flux'
import { setupRegistry } from '../registry'
import { AllOutput, AssetId2, FluxKey } from '../types'
import { runObservableWorker } from './utils/worker-utils'

runObservableWorker<WorkerInput, any>((input$) => {
    const command = new Subject()

    const toMainThreadSubject$ = new Subject<[FluxKey, AllOutput][]>()

    const registry = setupRegistry({ command })
    const flux = setupFlux({ command, registry })

    let sub: Subscription
    function update() {
        if (sub) sub.unsubscribe()
        sub = merge(...registry.ouputs)
            .pipe(
                tap((all) => {
                    toMainThreadSubject$.next([...all.entries()])
                })
            )
            .subscribe()
    }

    merge(
        input$.pipe(
            tap((command) => {
                console.log(command)
                switch (command.name) {
                    case 'subscribe':
                        registry.registerQuery(
                            command.data.query,
                            command.data.uuid
                        )
                        update()
                        break
                    case 'unsubscribe':
                        registry.unregisterQuery(command.data.uuid)
                        update()
                        break
                    case 'terminate':
                        {
                            if (sub) sub.unsubscribe()
                            registry.clear()
                        }
                        break

                    default:
                        break
                }
            })
            // map((ctrl) => {
            //     const queryCtx = new WorkerQueryContext(ctrl)
            //     return { ctx, queryCtx }
            // }),
            // concatMap((v) => of(v).pipe(processInput$))
        )
    ).subscribe()
    return toMainThreadSubject$.asObservable()
})

// const processInput$ = pipe(
//     tap((cc: WorkerContexts) => {
//         cc.ctx.toMainThreadSubject$.next()
//     })
// ) as UnaryFunction<Observable<WorkerContexts>, Observable<any>>

export default {} as typeof WebpackWorker
