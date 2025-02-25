import LogicalStep, { LogicalStepResult } from "./logical-step";
import { minValue, cellName } from "../solve-utility";
import type Board from "../board";

export default class NakedSingle extends LogicalStep {
    constructor(board: Board) {
        super(board, 'Naked Single');
    }

	step(board: Board, desc: string[]): 0|1|2 {
		if (board.nakedSingles.length === 0) {
			return LogicalStepResult.UNCHANGED;
		}

		const { size } = board;

		// Get the first naked single
		const cellIndex = board.nakedSingles[0];
		board.nakedSingles.shift();

		// Get the value
		const cellMask = board.cells[cellIndex];

		// If this cell is already given then don't report it
		if (cellMask & board.givenBit) {
			return this.step(board, desc);
		}

		const cellValue = minValue(cellMask);

		// Set the cell to the value
		if (!board.setAsGiven(cellIndex, cellValue)) {
			if (desc) {
				desc.push(`Naked Single: ${cellName(cellIndex, size)} cannot be set to ${cellValue}.`);
			}
			return LogicalStepResult.INVALID;
		}

		if (desc) {
			desc.push(`Naked Single: ${cellName(cellIndex, size)} = ${cellValue}.`);
		}
		return LogicalStepResult.CHANGED;
	}
}