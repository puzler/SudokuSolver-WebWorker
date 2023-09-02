// Constraint files add a build function to this object via the constraint-registry.
// The build function takes a board and parameter object and returns a constraint instance or an array of constraint instances.
// Example:
// registerConstraint("killercage", (board, params) => new KillerCageConstraint(board, params));
import Constraint from './constraints/constraint'
import Board from './board';
import { BoardDefinition } from './solve-worker';

const constraintBuilder = {};
const aggregateConstraintBuilders = [] as Array<(board: Board, boardData) => Array<Constraint>|Constraint>;
const constraintNames = [] as Array<string>;

export function buildConstraints(boardData, board: Board, boardDefinition: BoardDefinition = {}) {
	for (const builder of aggregateConstraintBuilders) {
		const newConstraints = builder(board, boardData);
		if (Array.isArray(newConstraints)) {
			for (const constraint of newConstraints) {
				if (!(constraint instanceof Constraint)) {
					throw new Error(`Aggregate constraint builder returned an array containing a non-constraint instance.`);
				}
				board.addConstraint(constraint);
			}
		} else if (newConstraints instanceof Constraint) {
			board.addConstraint(newConstraints);
		} else {
			throw new Error(`Aggregate constraint builder did not return an array or constraint instance.`);
		}
	}

	for (const constraintName of constraintNames) {
		const constraintDefinition = (boardDefinition.constraints || {})[constraintName]
		const constraintData = constraintDefinition?.collector?.call(undefined, boardData) || boardData[constraintName]

		const builder = constraintBuilder[constraintName];
		if (builder && constraintData) {
			for (const instance of constraintData) {
				const newConstraint = builder(board, instance, constraintDefinition);
				if (Array.isArray(newConstraint)) {
					for (const constraint of newConstraint) {
						if (!(constraint instanceof Constraint)) {
							throw new Error(`Constraint builder for ${constraintName} returned an array containing a non-constraint instance.`);
						}
						board.addConstraint(constraint);
					}
				} else if (newConstraint instanceof Constraint) {
					board.addConstraint(newConstraint);
				} else {
					throw new Error(`Constraint builder for ${constraintName} did not return an array or constraint instance.`);
				}
			}
		}
	}

	return board.finalizeConstraints();
}

// Assumes the data is an array of constraint instances and sends one instance at a time
export function registerConstraint(constraintName, builder: (board: Board, params, definition?: any) => void) {
	constraintBuilder[constraintName] = builder;
	constraintNames.push(constraintName);
}

// Always called, and sends the entire board data
export function registerAggregateConstraint(builder: (board: Board, boardData) => Array<Constraint>|Constraint) {
	aggregateConstraintBuilders.push(builder);
}
