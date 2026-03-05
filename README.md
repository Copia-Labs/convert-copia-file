# Convert Copia File

An action that converts a PLC file to diffable file format via the [Copia](https://app.copia.io) conversion service.

Works on both Copia-hosted and self-hosted runners — only requires the Node.js runtime.

## Usage

### Minimal Example

```yaml
- uses: Copia-Labs/convert-copia-file@v1
  with:
    token: ${{ secrets.COPIA_TOKEN }}
    file_path: path/to/project.ACD
    conversion: rockwell-acd
```

### Full Example

```yaml
- uses: Copia-Labs/convert-copia-file@v1
  id: convert
  with:
    server_url: https://app.copia.io # optional override
    token: ${{ secrets.COPIA_TOKEN }}
    file_path: path/to/project.ACD
    conversion: rockwell-acd
    output_path: output/project.L5X
    poll_timeout: '300'

- name: Print output path
  run: echo "Converted file saved to ${{ steps.convert.outputs.output_file }}"
```

## Inputs

| Name           | Required | Default                    | Description                                                                                            |
| -------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `token`        | yes      | —                          | Personal access token                                                                                  |
| `file_path`    | yes      | —                          | Path to the PLC file to convert                                                                        |
| `conversion`   | yes      | —                          | Conversion type (e.g. `rockwell-acd`, `siemens-zap17`)                                                 |
| `output_path`  | no       | `{file_path}.converted`    | Where to save the converted file                                                                       |
| `poll_timeout` | no       | `'600'`                    | Max seconds to wait for conversion                                                                     |
| `server_url`   | no       | `<URL of workflow origin>` | Base URL of the Copia instance. Defaults to the URL of the server where the workflow was started from. |

## Outputs

| Name          | Description                       |
| ------------- | --------------------------------- |
| `sha`         | The SHA of the uploaded file      |
| `output_file` | Path to the converted output file |

## Error Handling

The action fails with a descriptive message for common API errors:

| HTTP Status | Meaning                                |
| ----------- | -------------------------------------- |
| 401/403     | Authentication or authorization failed |
| 500         | Conversion error                       |

## Development

```bash
npm install
npm run build    # bundles dist/index.js via ncc
```

The `dist/` directory is committed to the repository so the action runs without an install step.
