// Web Worker client for FireWatch
// Handles communication with background workers

export class WorkerClient {
  constructor() {
    this.worker = null;
    this.messageHandlers = new Map();
  }

  initializeWorker(workerScript) {
    this.worker = new Worker(workerScript);
    this.worker.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, data } = event.data;
    const handler = this.messageHandlers.get(type);
    
    if (handler) {
      handler(data);
    }
  }

  onMessage(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  sendMessage(type, data) {
    if (this.worker) {
      this.worker.postMessage({ type, data });
    }
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
