import type Board from "../board";
import {
	popcount,
	valuesList,
	maskToString,
	cellName,
} from "../solve-utility";
import LogicalStep from "./logical-step";

export default class CellForcing extends LogicalStep {
    constructor(board: Board) {
        super(board, 'Cell Forcing');
    }

	step(board: Board, desc: string[]) {
		const { size, allValues, cells } = board;
		const numCells = size * size;
		for (let numCandidates = 2; numCandidates < size; numCandidates++) {
			for (let cellIndex = 0; cellIndex < numCells; cellIndex++) {
				const cellMask = cells[cellIndex] & allValues;
				if (popcount(cellMask) !== numCandidates) {
					continue;
				}

				const cellCandidates = valuesList(cellMask).map(value => board.candidateIndex(cellIndex, value));
				const elims = board.calcElimsForCandidateIndices(cellCandidates);
				if (elims.length === 0) {
					continue;
				}

				if (desc) {
					desc.push(`Cell Forcing: ${maskToString(cellMask, size)}${cellName(cellIndex, size)} => ${board.describeElims(elims)}.`);
				}
				return board.performElims(elims);
			}
		}
	}
}
