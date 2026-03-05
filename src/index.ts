import * as core from '@actions/core'
import { HttpClient } from '@actions/http-client'
import * as fs from 'fs'
import * as path from 'path'

interface CachePutResponse {
  sha: string
}

const POLL_INTERVAL_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getServerUrl(): string {
  const raw = core.getInput('server_url') || process.env.GITHUB_SERVER_URL || ''
  const serverUrl = raw.replace(/\/+$/, '')
  if (!serverUrl) {
    throw new Error(
      'server_url input or GITHUB_SERVER_URL environment variable must be set'
    )
  }
  return serverUrl
}

function assertAuthOk(statusCode: number): void {
  if (statusCode === 401 || statusCode === 403) {
    throw new Error(
      'Authentication failed — verify token is valid and has sufficient permissions'
    )
  }
}

/**
 * Checks whether a 200-response body is actually a conversion error
 * disguised as a successful response. Throws if it finds one.
 */
function throwIfConversionError(body: string, contentType: string): void {
  const isJsonOrText =
    contentType.includes('application/json') ||
    contentType.includes('text/plain')
  if (!isJsonOrText) {
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(body)
  } catch {
    // Not valid JSON -- treat as converted content
    return
  }

  if (
    typeof parsed.$type === 'string' &&
    parsed.$type.includes('ConversionServerError')
  ) {
    const message = typeof parsed.message === 'string' ? parsed.message : body
    throw new Error(`Conversion failed: ${message}`)
  }
}

async function run(): Promise<void> {
  try {
    const serverUrl = getServerUrl()
    const token = core.getInput('token', { required: true })
    const filePath = core.getInput('file_path', { required: true })
    const conversion = core.getInput('conversion', { required: true })
    const outputPath = core.getInput('output_path') || `${filePath}.converted`
    const pollTimeout = parseInt(core.getInput('poll_timeout') || '600', 10)

    core.setSecret(token)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Input file not found: ${filePath}`)
    }

    const fileName = path.basename(filePath)

    const authHeaders = { Authorization: `token ${token}` }

    const putUrl =
      `${serverUrl}/api/v1/user/conversion-cache-put` +
      `?conversion=${encodeURIComponent(conversion)}` +
      `&file=${encodeURIComponent(fileName)}`
    const getUrlBase = `${serverUrl}/api/v1/user/conversion-cache-get/${encodeURIComponent(conversion)}`

    const http = new HttpClient('convert-copia-file')

    core.info(`Uploading ${fileName} for ${conversion} conversion...`)
    const putResponse = await http.request(
      'POST',
      putUrl,
      fs.createReadStream(filePath),
      { 'Content-Type': 'application/octet-stream', ...authHeaders }
    )

    const putStatus = putResponse.message.statusCode ?? 0
    const putBody = await putResponse.readBody()

    assertAuthOk(putStatus)
    if (putStatus !== 202) {
      throw new Error(`Upload failed with HTTP ${putStatus}: ${putBody}`)
    }

    const { sha } = JSON.parse(putBody) as CachePutResponse
    core.info(`File uploaded, SHA: ${sha}`)
    core.setOutput('sha', sha)

    const getUrl = `${getUrlBase}/${sha}`
    const deadline = Date.now() + pollTimeout * 1000
    core.info(`Polling for conversion result (timeout: ${pollTimeout}s)...`)

    while (Date.now() < deadline) {
      const getResponse = await http.request('GET', getUrl, '', authHeaders)
      const getStatus = getResponse.message.statusCode ?? 0
      const body = await getResponse.readBody()

      assertAuthOk(getStatus)

      if (getStatus === 400 && body.toLowerCase().includes('cache miss')) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      if (getStatus === 400) {
        throw new Error(`Unexpected 400 response: ${body}`)
      }

      if (getStatus === 500) {
        throw new Error(`Conversion error: ${body}`)
      }

      if (getStatus !== 200) {
        throw new Error(`Unexpected API response: HTTP ${getStatus}: ${body}`)
      }

      const contentType = getResponse.message.headers['content-type'] || ''
      throwIfConversionError(body, contentType)

      const outputDir = path.dirname(outputPath)
      if (outputDir && !fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      fs.writeFileSync(outputPath, body)
      core.info(`Conversion complete, saved to: ${outputPath}`)
      core.setOutput('output_file', outputPath)
      return
    }

    throw new Error(`Conversion timed out after ${pollTimeout} seconds`)
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()
