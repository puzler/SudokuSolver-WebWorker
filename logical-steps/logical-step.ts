import type Board from "../board";

// Reflects what has happened to the board
export const LogicalStepResult = Object.freeze({
    UNCHANGED: 0,
    CHANGED: 1,
    INVALID: 2,
});

export default class LogicalStep {
    constructor(board: Board, name: string) {
        this.name = name;

        // Cache common values
        this.size = board.size;
        this.allValues = board.allValues;
        this.givenBit = board.givenBit;
        this.cellIndex = board.cellIndex;
        this.cellCoords = board.cellCoords;
        this.candidateIndexRC = board.candidateIndexRC;
        this.candidateIndex = board.candidateIndex;
        this.cellIndexFromCandidate = board.cellIndexFromCandidate;
        this.valueFromCandidate = board.valueFromCandidate;
        this.maskStrictlyLower = board.maskStrictlyLower;
        this.maskStrictlyHigher = board.maskStrictlyHigher;
        this.maskLowerOrEqual = board.maskLowerOrEqual;
        this.maskHigherOrEqual = board.maskHigherOrEqual;
        this.maskBetweenInclusive = board.maskBetweenInclusive;
        this.maskBetweenExclusive = board.maskBetweenExclusive;
    }

    name: string
    constraintName?: string
    size: number
    allValues: any
    givenBit: number
    cellIndex: (row: number, col: number) => number
    cellCoords: (index: number) => number[]
    candidateIndexRC: (row: number, col: number, value: number) => number
    candidateIndex: (cellIndex: number, value: number) => number
    cellIndexFromCandidate: (candidateIndex: number) => number
    valueFromCandidate: (candidateIndex: number) => number
    maskStrictlyLower: (v: any) => number
    maskStrictlyHigher: (v: any) => number
    maskLowerOrEqual: (v: any) => number
    maskHigherOrEqual: (v: any) => number
    maskBetweenInclusive: (v1: any, v2: any) => number
    maskBetweenExclusive: (v1: any, v2: any) => number

    // Returns the name of the logical step
    toString() {
        return this.constraintName;
    }

	step(board: Board, desc: string[]): 0|1|2|undefined {
		return LogicalStepResult.UNCHANGED;
	}
}