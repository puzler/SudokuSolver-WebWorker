// Reflects what has happened to the board
export const LogicalStepResult = Object.freeze({
    UNCHANGED: 0,
    CHANGED: 1,
    INVALID: 2,
});

export default class LogicalStep {
    constructor(board, name) {
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
    givenBit: any
    cellIndex: any
    cellCoords: any
    candidateIndexRC: any
    candidateIndex: any
    cellIndexFromCandidate: any
    valueFromCandidate: any
    maskStrictlyLower: any
    maskStrictlyHigher: any
    maskLowerOrEqual: any
    maskHigherOrEqual: any
    maskBetweenInclusive: any
    maskBetweenExclusive: any

    // Returns the name of the logical step
    toString() {
        return this.constraintName;
    }

	step(board, desc): 0|1|2 {
		return LogicalStepResult.UNCHANGED;
	}
}