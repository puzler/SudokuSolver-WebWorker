import type {
  BoardDefinition,
  CandidatesList,
  SolverConstructor,
  CellDataParam,
} from './types'
export type { BoardDefinition, CellDataParam }

class SudokuSolver {
  runningOp = null as null|string
  worker?: Worker
  rawDefinition?: BoardDefinition
  cancelTimeoutCheck = false

  constructor(args: SolverConstructor) {
    console.log('Initializing Solver Interface')
    this.onSolution = args.onSolution
    this.onInvalid = args.onInvalid
    this.onCancelled = args.onCancelled
    this.onNoSolution = args.onNoSolution
    this.onCount = args.onCount
    this.onTrueCandidates = args.onTrueCandidates
    this.onStep = args.onStep
    this.onLogicalSolve = args.onLogicalSolve
    this.rawDefinition = args.boardDefinition

    this.setupWorker()
  }

  private setupWorker() {
    console.log('Setting up worker')
    this.worker = new Worker(
      new URL('./solve-worker.ts', import.meta.url),
      { type: 'module' },
    )

    if (!this.worker) return
    this.worker.onmessage = ({ data }) => {
      switch (data.result) {
        case 'solution':
          this.runningOp = null
          if (this.onSolution) this.onSolution(data.solution)
          break
        case 'invalid':
          this.runningOp = null
          if (this.onInvalid) this.onInvalid()
          break
        case 'cancelled':
          this.runningOp = null
          this.cancelTimeoutCheck = false
          if (this.onCancelled) this.onCancelled()
          break
        case 'no solution':
          this.runningOp = null
          if (this.onNoSolution) this.onNoSolution()
          break
        case 'count':
          if (data.complete || data.cancelled) this.runningOp = null
          if (this.onCount) this.onCount(data.count, data.complete, data.cancelled)
          break
        case 'truecandidates':
          this.runningOp = null
          if (this.onTrueCandidates) this.onTrueCandidates(data.candidates, data.counts)
          break
        case 'step':
          this.runningOp = null
          if (this.onStep) this.onStep(data.desc, data.invalid, data.changed, data.candidates)
          break
        case 'logicalsolve':
          this.runningOp = null
          if (this.onLogicalSolve) this.onLogicalSolve(data.desc, data.invalid, data.changed, data.candidates)
          break
      }
    }

    if (this.rawDefinition) this.defineWorkerBoard()
  }

  defineWorkerBoard() {
    if (!this.worker) return
    if (!this.rawDefinition) return

    const definition = JSON.stringify(
      this.rawDefinition,
      (_, value) => {
        if (typeof value !== 'function') return value

        return {
          func: value.toString(),
          encodedFunc: true,
        }
      },
    )

    this.worker.postMessage({
      cmd: 'define',
      definition,
    })
  }

  onSolution?: (solution: Array<number>) => void
  onInvalid?: () => void
  onCancelled?: () => void
  onNoSolution?: () => void
  onCount?: (count: number, complete: boolean, cancelled?: boolean) => void
  onTrueCandidates?: (candidates: CandidatesList, counts: any) => void
  onStep?: (desc: string, invalid: boolean, changed: boolean, candidates?: CandidatesList) => void
  onLogicalSolve?: (desc: Array<string>, invalid: boolean, changed: boolean, candidates?: CandidatesList) => void

  solve(board: any) {
    ('triggering solve')
    if (!this.worker) return
    this.runningOp = 'solve'
    this.worker.postMessage({
      cmd: 'solve',
      board,
      options: { random: true },
    })
  }

  count(board: any, options?: { maxSolutions?: number }) {
    if (!this.worker) return
    this.runningOp = 'count'
    this.worker.postMessage({
      cmd: 'count',
      board,
      options,
    })
  }

  trueCandidates(board: any) {
    if (!this.worker) return
    this.runningOp = 'true-candidates'
    this.worker.postMessage({
      cmd: 'truecandidates',
      board,
    })
  }

  step(board: any) {
    if (!this.worker) return
    this.runningOp = 'step'
    this.worker.postMessage({
      cmd: 'step',
      board,
    })
  }

  logicalSolve(board: any) {
    if (!this.worker) return
    this.runningOp = 'logical-solve'
    this.worker.postMessage({
      cmd: 'logicalsolve',
      board,
    })
  }

  cancel() {
    if (!this.worker) return
    if (!this.runningOp) return

    this.cancelTimeoutCheck = true
    this.worker.postMessage({
      cmd: 'cancel'
    })

    setTimeout(() => {
      if (this.cancelTimeoutCheck) {
        this.restartWorker()
        this.runningOp = null
        if (this.onCancelled) this.onCancelled()
      }
    }, 5000)
  }

  restartWorker() {
    this.setupWorker()

    if (this.onCancelled) this.onCancelled()
  }
}

export default SudokuSolver
