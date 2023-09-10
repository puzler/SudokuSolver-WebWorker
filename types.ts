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
      antiking?: (boardData: any) => undefined|null|boolean
      antiknight?: (boardData: any) => undefined|null|boolean
      'diagonal+'?: (boardData: any) => undefined|null|boolean
      'diagonal-'?: (boardData: any) => undefined|null|boolean
      disjointgroups?: (boardData: any) => undefined|null|boolean
      extraregion?: {
        collector?: (boardData: any) => undefined|null|any[]
      }
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
      palindrome?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      clone?: {
        collector?: (boardData: any) => undefined|null|any[]
        cloneGroups?: (instance: any) => any[][]
      }
      even?: {
        collector?: (boardData: any) => undefined|null|any[]
        cell?: (instance: any) => any
      }
      odd?: {
        collector?: (boardData: any) => undefined|null|any[]
        cell?: (instance: any) => any
      }
      minimum?: {
        collector?: (boardData: any) => undefined|null|any[]
        cell?: (instance: any) => any
      }
      maximum?: {
        collector?: (boardData: any) => undefined|null|any[]
        cell?: (instance: any) => any
      }
      germanwhispers?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      dutchwhispers?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      betweenline?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      renban?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      thermometer?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      slowthermometer?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      fastthermometer?: {
        collector?: (boardData: any) => undefined|null|any[]
        lines?: (instance: any) => any[][]
      }
      quadruple?: {
        collector?: (boardData: any) => undefined|null|any[]
        cells?: (instance: any) => any[]
        values?: (instance: any) => number[]
      }
  }
  indexForAddress?: (address: any, size: number) => number
}

export type CandidatesList = Array<Array<number>|{ given: boolean; value: number }>
