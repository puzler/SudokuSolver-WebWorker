import type Board from "../board";
import LogicalStep, { LogicalStepResult } from "./logical-step";

export default class ConstraintLogic extends LogicalStep {
    constructor(board: Board) {
        super(board, 'Constraint Logic');
    }

	step(board: Board, desc: string[]) {
		const { constraints } = board;
		for (let constraint of constraints) {
            const result = constraint.logicStep(board, desc);
            if (result !== LogicalStepResult.UNCHANGED) {
				return result;
			}
        }
	}
}
