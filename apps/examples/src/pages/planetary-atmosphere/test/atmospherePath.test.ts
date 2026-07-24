import { assert, test } from 'vitest'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import { intersectRaySphere } from '../math/raySphere.ts'
import { close } from './assertions.ts'

test('大气外 Production 积分区间只覆盖实际大气路径', () => {
  const atmosphereRadius = EARTH_ATMOSPHERE.topRadiusKm
  const groundRadius = EARTH_ATMOSPHERE.bottomRadiusKm

  const missesAtmosphere = intersectRaySphere(
    [0, 0, atmosphereRadius + 6.5],
    [1, 0, 0],
    [0, 0, 0],
    atmosphereRadius,
  )
  assert.equal(missesAtmosphere, null)

  const shellOrigin: [number, number, number] = [-7000, 6400, 0]
  const shellDirection: [number, number, number] = [1, 0, 0]
  const shellAtmosphere = intersectRaySphere(
    shellOrigin,
    shellDirection,
    [0, 0, 0],
    atmosphereRadius,
  )
  const shellGround = intersectRaySphere(
    shellOrigin,
    shellDirection,
    [0, 0, 0],
    groundRadius,
  )
  assert.ok(shellAtmosphere)
  assert.equal(shellGround, null)
  assert.ok(shellAtmosphere.near > 0)
  assert.ok(shellAtmosphere.far > shellAtmosphere.near)

  const groundOrigin: [number, number, number] = [-7000, 0, 0]
  const groundDirection: [number, number, number] = [1, 0, 0]
  const groundAtmosphere = intersectRaySphere(
    groundOrigin,
    groundDirection,
    [0, 0, 0],
    atmosphereRadius,
  )
  const ground = intersectRaySphere(
    groundOrigin,
    groundDirection,
    [0, 0, 0],
    groundRadius,
  )
  assert.ok(groundAtmosphere)
  assert.ok(ground)
  close(
    ground.near - groundAtmosphere.near,
    atmosphereRadius - groundRadius,
  )
})
