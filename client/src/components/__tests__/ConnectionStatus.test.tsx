import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionStatus } from '../ConnectionStatus'

const defaultProps = {
  connectionState: 'idle' as const,
  connectSubState: null,
  signalingConnected: false,
  peers: new Map(),
  localPeerId: 'test-peer-id-12345',
}

describe('ConnectionStatus', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<ConnectionStatus {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders progress bar when connecting', () => {
    render(
      <ConnectionStatus
        {...defaultProps}
        connectionState="connecting"
        connectSubState="acquiring-media"
      />,
    )
    expect(screen.getByText(/Acquiring media/)).toBeDefined()
    expect(screen.getByText(/2\/5/)).toBeDefined()
  })

  it('renders connected info strip when connected', () => {
    render(
      <ConnectionStatus
        {...defaultProps}
        connectionState="connected"
        signalingConnected={true}
      />,
    )
    expect(screen.getByText('Connected')).toBeDefined()
    expect(screen.getByText(/0 peers/)).toBeDefined()
    expect(screen.getByText('WS')).toBeDefined()
  })

  it('renders failed bar with retry button', async () => {
    const onRetry = vi.fn()
    render(
      <ConnectionStatus
        {...defaultProps}
        connectionState="failed"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText('Connection failed')).toBeDefined()
    
    const retryBtn = screen.getByText('Retry')
    await userEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders reconnecting bar with attempt counter', () => {
    render(
      <ConnectionStatus
        {...defaultProps}
        connectionState="reconnecting"
        reconnectAttempt={2}
        reconnectMaxAttempts={5}
      />,
    )
    expect(screen.getByText(/Reconnecting/)).toBeDefined()
    expect(screen.getByText(/attempt 2\/5/)).toBeDefined()
  })

  it('toggles debug panel on pill click', async () => {
    render(
      <ConnectionStatus
        {...defaultProps}
        connectionState="connected"
        signalingConnected={true}
      />,
    )
    
    const pill = screen.getByText('Connected')
    await userEvent.click(pill)
    
    expect(screen.getByText('Signaling WS')).toBeDefined()
  })
})
