import { parseSlashCommand } from './commandParser'

describe('parseSlashCommand', () => {
  it('parses command and args with lowercase command normalization', () => {
    expect(parseSlashCommand('/MODEL llama3.1:8b')).toEqual({
      cmd: 'model',
      args: ['llama3.1:8b'],
    })
  })

  it('handles quoted arguments with spaces', () => {
    expect(parseSlashCommand('/pull "llama 3.1 8b"')).toEqual({
      cmd: 'pull',
      args: ['llama 3.1 8b'],
    })
  })

  it('handles mixed single quotes and escapes', () => {
    expect(parseSlashCommand("/run 'hello world' value\\ with\\ spaces")).toEqual({
      cmd: 'run',
      args: ['hello world', 'value with spaces'],
    })
  })

  it('returns empty command for blank slash input', () => {
    expect(parseSlashCommand('/')).toEqual({
      cmd: '',
      args: [],
    })
  })
})
