const QUERY_COUNT = 16
const QUERY_BYTES = BigUint64Array.BYTES_PER_ELEMENT
const SAMPLE_INTERVAL_MILLISECONDS = 500

export class GpuTimestampRecorder {
  private readonly device: GPUDevice
  private readonly querySet: GPUQuerySet
  private readonly resolveBuffer: GPUBuffer
  private readonly readBuffer: GPUBuffer
  private readonly mapReadMode: number
  private labels: string[] = []
  private queryCount = 0
  private recording = false
  private readPending = false
  private lastSampledAt = -Infinity
  private latestDurations: Readonly<Record<string, number>> = Object.freeze({})

  constructor(
    device: GPUDevice,
    bufferUsage: {
      QUERY_RESOLVE: number
      COPY_SRC: number
      COPY_DST: number
      MAP_READ: number
    },
    mapReadMode: number,
  ) {
    this.device = device
    this.mapReadMode = mapReadMode
    this.querySet = device.createQuerySet({
      label: '大气 pass timestamp queries',
      type: 'timestamp',
      count: QUERY_COUNT,
    })
    const byteSize = QUERY_COUNT * QUERY_BYTES
    this.resolveBuffer = device.createBuffer({
      label: '大气 timestamp resolve buffer',
      size: byteSize,
      usage: bufferUsage.QUERY_RESOLVE | bufferUsage.COPY_SRC,
    })
    this.readBuffer = device.createBuffer({
      label: '大气 timestamp read buffer',
      size: byteSize,
      usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ,
    })
  }

  get latest(): Readonly<Record<string, number>> {
    return this.latestDurations
  }

  beginFrame(now: number): void {
    this.recording =
      !this.readPending &&
      now - this.lastSampledAt >= SAMPLE_INTERVAL_MILLISECONDS
    this.labels = []
    this.queryCount = 0
  }

  timestampWrites(label: string): GPUComputePassTimestampWrites | undefined {
    if (!this.recording || this.queryCount + 2 > QUERY_COUNT) {
      return undefined
    }

    const beginningOfPassWriteIndex = this.queryCount
    const endOfPassWriteIndex = this.queryCount + 1
    this.queryCount += 2
    this.labels.push(label)

    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex,
      endOfPassWriteIndex,
    }
  }

  resolve(commandEncoder: GPUCommandEncoder): boolean {
    if (!this.recording || this.queryCount === 0) {
      return false
    }

    commandEncoder.resolveQuerySet(
      this.querySet,
      0,
      this.queryCount,
      this.resolveBuffer,
      0,
    )
    commandEncoder.copyBufferToBuffer(
      this.resolveBuffer,
      0,
      this.readBuffer,
      0,
      this.queryCount * QUERY_BYTES,
    )
    this.recording = false
    this.readPending = true
    return true
  }

  readSubmitted(): void {
    const labels = [...this.labels]
    const queryCount = this.queryCount

    void this.device.queue
      .onSubmittedWorkDone()
      .then(() => this.readBuffer.mapAsync(this.mapReadMode))
      .then(() => {
        const timestamps = new BigUint64Array(
          this.readBuffer.getMappedRange(),
          0,
          queryCount,
        )
        const durations: Record<string, number> = {}

        for (let index = 0; index < labels.length; index += 1) {
          const beginning = timestamps[index * 2]
          const end = timestamps[index * 2 + 1]
          durations[labels[index]] = Number(end - beginning) / 1_000_000
        }

        this.latestDurations = Object.freeze(durations)
        this.readBuffer.unmap()
        this.readPending = false
        this.lastSampledAt = performance.now()
      })
      .catch((error: unknown) => {
        if (this.readBuffer.mapState === 'mapped') {
          this.readBuffer.unmap()
        }
        this.readPending = false
        console.error('GPU timestamp 读取失败：', error)
      })
  }

  destroy(): void {
    if (this.readBuffer.mapState === 'mapped') {
      this.readBuffer.unmap()
    }
    this.querySet.destroy()
    this.resolveBuffer.destroy()
    this.readBuffer.destroy()
  }
}
