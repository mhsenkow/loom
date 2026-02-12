import { assessBootstrapReadiness, buildBootstrapPlan } from './terminalModelBootstrapCommand'

describe('terminalModelBootstrapCommand planning', () => {
  it('plans all categories when none are ready', () => {
    const readiness = assessBootstrapReadiness([], false, false, false)
    const plan = buildBootstrapPlan(readiness)

    expect(plan.missingLocalModels).toEqual([
      'tinyllama',
      'llama3.1:8b',
      'x/flux2-klein',
    ])
    expect(plan.needsMusicDownload).toBe(true)
    expect(plan.allReady).toBe(false)
  })

  it('plans only missing categories when some are ready', () => {
    const readiness = assessBootstrapReadiness(
      ['tinyllama', 'x/flux2-klein'],
      true,
      false,
      false,
    )
    const plan = buildBootstrapPlan(readiness)

    expect(plan.missingLocalModels).toEqual(['llama3.1:8b'])
    expect(plan.needsMusicDownload).toBe(true)
    expect(plan.allReady).toBe(false)
  })

  it('reports all ready when all categories are available', () => {
    const readiness = assessBootstrapReadiness(
      ['tinyllama', 'llama3.1:8b', 'x/flux2-klein:4b'],
      true,
      true,
      false,
    )
    const plan = buildBootstrapPlan(readiness)

    expect(plan.missingLocalModels).toEqual([])
    expect(plan.needsMusicDownload).toBe(false)
    expect(plan.allReady).toBe(true)
  })
})
