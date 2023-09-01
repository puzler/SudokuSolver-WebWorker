let currentWorker = null as null|Worker

function worker() {
  if (currentWorker) return currentWorker
  currentWorker = new Worker(new URL('./SolveWorker.js', import.meta.url))
  return currentWorker
}

function newWorker() {
  currentWorker?.terminate()
  currentWorker = null
  return worker()
}

export default {
  worker,
  newWorker,
}
