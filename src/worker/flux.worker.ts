/* eslint-disable import/no-relative-parent-imports */
import { merge, Observable, of, pipe, UnaryFunction } from 'rxjs'
import { map, concatMap, tap } from 'rxjs/operators'

import { runObservableWorker } from '../common/worker-utils'
import {
    MasterWorkerContext,
    WorkerContexts,
    WorkerQueryContext,
} from './contexts'
import { FetchTransport } from './rpc/fetch'
import { Commands, WorkerInput } from './types'

runObservableWorker<WorkerInput, any>((input$) => {
    const ctx = new MasterWorkerContext()
    ctx.transport = new FetchTransport({
        host: self.location.host,
        protocol: self.location.protocol,
    })
    merge(
        input$.pipe(
            map((ctrl) => {
                const queryCtx = new WorkerQueryContext(ctrl)
                return { ctx, queryCtx }
            }),
            concatMap((v) => of(v).pipe(processInput$))
        ),
        ctx.events$.pipe(
            // throttleTime(2),
            tap((result) => {
                ctx.toMainThreadSubject$.next(result)
            })
        )
    ).subscribe()
    return ctx.toMainThreadSubject$.asObservable()
})

const processInput$ = pipe(
    tap((cc) => {
        const { ctx, queryCtx } = cc
        const { command, unsubscribe } = queryCtx.ctrl
        cc.ctx.registerInput(queryCtx.ctrl)
        if (typeof command === 'string') {
        } else if (command) {
            if (command.name === Commands.INIT) {
                ctx.transport.setTransportOptions(command.data)
            }
        } else {
            if (unsubscribe) {
                cc.ctx.unregisterInput(unsubscribe)
            }
        }
    }),
    tap((cc: WorkerContexts) => {
        cc.ctx.toMainThreadSubject$.next()
    })
) as UnaryFunction<Observable<WorkerContexts>, Observable<any>>
