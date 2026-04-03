import { ingestEvidence } from '../lib/evidence/ingest.ts'

function readFlag(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : undefined
}

async function main(): Promise<void> {
  const source = readFlag('source')
  const sourcesFlag = readFlag('sources')
  const yearsFlag = readFlag('years')
  const dbPath = readFlag('db')
  const eventsFlag = readFlag('events')
  const limitFlag = readFlag('limit')
  const limitPerEventFlag = readFlag('limit-per-event')
  const limitPerSourceFlag = readFlag('limit-per-source')
  const limitPerEventPerSourceFlag = readFlag('limit-per-event-per-source')
  const limitPerEventPerYearFlag = readFlag('limit-per-event-per-year')
  const limit = limitFlag ? Number.parseInt(limitFlag, 10) : undefined
  const limitPerEvent = limitPerEventFlag ? Number.parseInt(limitPerEventFlag, 10) : undefined
  const limitPerSource = limitPerSourceFlag ? Number.parseInt(limitPerSourceFlag, 10) : undefined
  const limitPerEventPerSource = limitPerEventPerSourceFlag
    ? Number.parseInt(limitPerEventPerSourceFlag, 10)
    : undefined
  const limitPerEventPerYear = limitPerEventPerYearFlag ? Number.parseInt(limitPerEventPerYearFlag, 10) : undefined
  const events = eventsFlag
    ? eventsFlag
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined
  const sources = sourcesFlag
    ? sourcesFlag
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined
  const years = yearsFlag
    ? yearsFlag
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined

  if (limitFlag && !Number.isFinite(limit)) {
    throw new Error(`Invalid --limit value: ${limitFlag}`)
  }
  if (limitPerEventFlag && !Number.isFinite(limitPerEvent)) {
    throw new Error(`Invalid --limit-per-event value: ${limitPerEventFlag}`)
  }
  if (limitPerSourceFlag && !Number.isFinite(limitPerSource)) {
    throw new Error(`Invalid --limit-per-source value: ${limitPerSourceFlag}`)
  }
  if (limitPerEventPerSourceFlag && !Number.isFinite(limitPerEventPerSource)) {
    throw new Error(`Invalid --limit-per-event-per-source value: ${limitPerEventPerSourceFlag}`)
  }
  if (limitPerEventPerYearFlag && !Number.isFinite(limitPerEventPerYear)) {
    throw new Error(`Invalid --limit-per-event-per-year value: ${limitPerEventPerYearFlag}`)
  }

  const result = await ingestEvidence({
    source,
    sources,
    years,
    dbPath,
    events,
    limit,
    limitPerEvent,
    limitPerSource,
    limitPerEventPerSource,
    limitPerEventPerYear,
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
