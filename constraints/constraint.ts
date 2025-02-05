import type Board from "../board";

// Reflects what has happened to the board
export const ConstraintResult = Object.freeze({
	UNCHANGED: 0,
	CHANGED: 1,
	INVALID: 2,
});

export default class Constraint {
    // The constraintName is a string that is used to identify the constraint
    // The specificName is a string that is specific to this constraint instance
    constructor(board: Board, constraintName: string, specificName: string) {
        this.constraintName = constraintName;
        this.specificName = specificName;

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

    constraintName: string
    specificName: string
    size: number
    allValues: number
    givenBit: number
    cellIndex: (row: number, col: number) => number
    cellCoords: (cellIndex: number) => number[]
    candidateIndexRC: (row: number, col: number, value: number) => number
    candidateIndex: (cellIndex: number, value: number) => number
    cellIndexFromCandidate: (candidateIndex: number) => number
    valueFromCandidate: (candidateIndex: number) => number
    maskStrictlyLower: (v: number) => number
    maskStrictlyHigher: (v: number) => number
    maskLowerOrEqual: (v: number) => number
    maskHigherOrEqual: (v: number) => number
    maskBetweenInclusive: (v1: number, v2: number) => number
    maskBetweenExclusive: (v1: number, v2: number) => number

    // Returns the name of the constraint
    toString() {
        return this.constraintName;
    }

    // Returns a string that is specific to this constraint instance
    toSpecificString() {
        return this.specificName;
    }

    // Initialize the constraint on the board, which may modify the board
    // Adding weak links should be done here
    // Returns a ConstraintResult
    // init is called repeatedly on every constraint until all constraints return ConstraintResult.UNCHANGED
    //  - This allows constraints to interact with each other
    //  - isRepeat is true if this is not the first time init has been called on this constraint
	// Never call board.setAsGiven from init as not all weak links have been added yet, so they may not be respected.
	//  - Instead, use board.keepCellMask(cell, valueBit(value)) so that it will be a naked single at the appropriate time.
    init(board: Board, isRepeat: boolean): 0|1|2 {
        return ConstraintResult.UNCHANGED;
    }

    // Return true if the constraint is still satisfiable (false means the constraint is violated).
    // Do not modify the board (it cannot be reported to the user)
    enforce(board: Board, cellIndex: number, value: number) {
        return true;
    }

    // Perform a logic step on the board, which may modify the board
    // logicalStepDescription is an optional array of strings that will be filled with a description of the logic step
	// This is used to report the logic step to the user
    // Returns a ConstraintResult
    logicStep(board: Board, logicalStepDescription: null|string[]): 0|1|2 {
        return ConstraintResult.UNCHANGED;
    }

    // Utility functions
    taxiCabDistance(cellIndex1: number, cellIndex2: number) {
        const [row1, col1] = this.cellCoords(cellIndex1);
        const [row2, col2] = this.cellCoords(cellIndex2);
        return Math.abs(row1 - row2) + Math.abs(col1 - col2);
    }

    isAdjacent(cellIndex1: number, cellIndex2: number) {
        return this.taxiCabDistance(cellIndex1, cellIndex2) === 1;
    }

    isDiagonal(cellIndex1: number, cellIndex2: number) {
        return this.taxiCabDistance(cellIndex1, cellIndex2) === 2;
    }

    getOffset(cellIndex1: number, cellIndex2: number) {
        const [row1, col1] = this.cellCoords(cellIndex1);
        const [row2, col2] = this.cellCoords(cellIndex2);
        return [row2 - row1, col2 - col1];
    }

    getAbsoluteOffset(cellIndex1: number, cellIndex2: number) {
        const [row1, col1] = this.cellCoords(cellIndex1);
        const [row2, col2] = this.cellCoords(cellIndex2);
        return [Math.abs(row2 - row1), Math.abs(col2 - col1)];
    }
}
