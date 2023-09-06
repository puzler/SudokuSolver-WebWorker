import { register as registerKillerCageConstraint } from './constraints/killer-cage-constraint'
import { register as registerArrowConstraint } from './constraints/arrow-sum-constraint'
import { register as registerRegionSumLineConstraint } from './constraints/region-sum-lines-constraint'
import { register as registerFixedSumConstraint } from './constraints/fixed-sum-constraint'
import { register as registerGeneralCellPairConstraints } from './constraints/general-cell-pair-constraint'
import { register as registerExtraRegionConstraints } from './constraints/extra-region-constraint'
import { register as registerEqualCellsConstraints } from './constraints/equal-cells-contraint'

export default function registerAllConstraints() {
  registerKillerCageConstraint()
  registerArrowConstraint()
  registerRegionSumLineConstraint()
  registerFixedSumConstraint()
  registerGeneralCellPairConstraints()
  registerExtraRegionConstraints()
  registerEqualCellsConstraints()
}
