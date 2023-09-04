export type CellDataParam = {
  cell: any
  row: number
  column: number
  boardData: any
}

export type BoardDefinition = {
  grid?: {
      cells?: (boardData: any) => Array<Array<any>>
      givenPencilMarks?: (cellDataParam: CellDataParam) => undefined|null|Array<number>
      centerPencilMarks?: (cellDataParam: CellDataParam) => undefined|null|Array<number>
      value?: (cellDataParam: CellDataParam) => undefined|null|number
      cellIsGiven?: (cellDataParam: CellDataParam) => boolean
  }
  constraints?: {
      arrow?: {
          collector?: (boardData: any) => undefined|null|any[]
          circleCells?: (arrow: any) => Array<any>
          lines?: (arrow: any) => Array<any>
      }
      difference?: {
          collector?: (boardData: any) => undefined|null|any[]
          value?: (dot: any) => undefined|null|number
          negative?: (boardData: any) => boolean
          cells?: (dot: any) => any[]
      }
      ratio?: {
          collector?: (boardData: any) => undefined|null|any[]
          value?: (dot: any) => undefined|null|number
          negative?: (boardData: any) => boolean
          cells?: (dot: any) => any[]
      }
      xv?: {
          collector?: (boardData: any) => undefined|null|any[]
          value?: (instance: any) => undefined|null|'x'|'X'|'v'|'V'
          cells?: (instance: any) => any[]
          negative?: (boardData: any) => boolean|{ x: boolean; v: boolean }
      }
      sum?: {
          collector?: (boardData: any) => undefined|null|any[]
          value?: (instance: any) => any
          cells?: (instance: any) => any[]
          negative?: (boardData: any) => boolean
      }
      littlekillersum?: {
          collector?: (boardData: any) => undefined|null|any[]
          value?: (instance: any) => any
          clueCellName?: (instance: any) => string
          cells?: (instance: any, size: number) => any[]
      }
      killercage?: {
          collector?: (boardData: any) => undefined|null|any[]
          cells?: (instance: any) => any[]
          value?: (instance: any) => undefined|null|string|number
      }
      regionsumline?: {
          collector?: (boardData: any) => undefined|null|any[]
          lines?: (instance: any) => any[][]
      }
  }
  indexForAddress?: (address: any, size: number) => number
}

export type CandidatesList = Array<Array<number>|{ given: boolean; value: number }>

export type SolverConstructor = {
  onSolution?: (solution: Array<number>) => void
  onInvalid?: () => void
  onCancelled?: () => void
  onNoSolution?: () => void
  onCount?: (count: number, complete: boolean, cancelled?: boolean) => void
  onTrueCandidates?: (candidates: CandidatesList, counts: any) => void
  onStep?: (desc: string, invalid: boolean, changed: boolean, candidates?: CandidatesList) => void
  onLogicalSolve?: (desc: Array<string>, invalid: boolean, changed: boolean, candidates?: CandidatesList) => void
  boardDefinition?: BoardDefinition
}