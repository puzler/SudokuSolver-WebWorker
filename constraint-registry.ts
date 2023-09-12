import { register as registerKillerCageConstraint } from './constraints/killer-cage-constraint'
import { register as registerArrowConstraint } from './constraints/arrow-sum-constraint'
import { register as registerRegionSumLineConstraint } from './constraints/region-sum-lines-constraint'
import { register as registerFixedSumConstraint } from './constraints/fixed-sum-constraint'
import { register as registerGeneralCellPairConstraints } from './constraints/general-cell-pair-constraint'
import { register as registerExtraRegionConstraints } from './constraints/extra-region-constraint'
import { register as registerEqualCellsConstraints } from './constraints/equal-cells-constraint'
import { register as registerSingleCellMaskConstraints } from './constraints/single-cell-mask-constraint'
import { register as registerInequalityConstraints } from './constraints/inequality-constraint'
import { register as registerWhisperConstraints } from './constraints/whisper-line-constraint'
import { register as registerBetweenLineConstraints } from './constraints/between-lines-constraint'
import { register as registerRenbanLineConstraints } from './constraints/renban-lines-constraint'
import { register as registerThermometerConstraints } from './constraints/thermometer-constraint'
import { register as registerKnownDigitsInCellsConstraint } from './constraints/known-digits-in-cells-constraint'
import { register as registerXSumConstraint } from './constraints/x-sum-constraint'
import { register as registerSandwichSumConstraint } from './constraints/sandwich-sum-constraint'
import { register as registerRegionIndexCellConstraint } from './constraints/region-index-cell-constraint'

export default function registerAllConstraints() {
  registerKillerCageConstraint()
  registerArrowConstraint()
  registerRegionSumLineConstraint()
  registerFixedSumConstraint()
  registerGeneralCellPairConstraints()
  registerExtraRegionConstraints()
  registerEqualCellsConstraints()
  registerSingleCellMaskConstraints()
  registerInequalityConstraints()
  registerWhisperConstraints()
  registerBetweenLineConstraints()
  registerRenbanLineConstraints()
  registerThermometerConstraints()
  registerKnownDigitsInCellsConstraint()
  registerXSumConstraint()
  registerSandwichSumConstraint()
  registerRegionIndexCellConstraint()
}
