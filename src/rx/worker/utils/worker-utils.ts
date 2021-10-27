import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

interface Transferable {
    event: string
    decoderKey: string
    buf: Uint8Array
}

export function runObservableWorker<I, O extends any | Transferable>(
    processFn: (input: Observable<I>) => Observable<O>
) {
    const ctx = globalThis as unknown as Worker

    const input$ = new Observable<I>((inputSub) => {
        ctx.onmessage = (evt) => {
            inputSub.next(evt.data)
        }

        ctx.onerror = (evt) => {
            inputSub.error(evt.error)
            inputSub.complete()
        }
    })

    const output$ = processFn(input$)
    output$.subscribe(
        (n) => {
            if (n) {
                ctx.postMessage(n)
                // ctx.postMessage({ data: n.data }, [n.data]);
            }
        },
        (err) => {
            console.error(err)
            ctx.postMessage(null)
        },
        () => {
            ctx.postMessage(null)
        }
    )
}

// export function createObservableWebWorker<I extends Transferable, O>(
export function createObservableWebWorker<I, O>(
    worker: Worker,
    input: Observable<I>
): Observable<O> {
    return new Observable<O>((sub) => {
        input.pipe(tap((n) => worker.postMessage(n))).subscribe()
        if (!worker) {
            throw new Error(`must have valid web worker`)
        }

        function onMessage(evt: MessageEvent) {
            sub.next(evt.data)
        }

        function onError(evt: ErrorEvent) {}

        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        // When the consumer unsubscribes, clean up data ready for next subscription.
        return {
            unsubscribe() {
                // worker.terminate()
            },
        }
    })
}
