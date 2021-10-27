class WebpackWorker extends Worker {
    constructor()
}

declare module '*.worker.ts' {
    export default WebpackWorker
}
