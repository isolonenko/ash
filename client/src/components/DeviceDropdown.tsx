import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useDevices, useSelectedDevices, useMediaActions } from '@/hooks/useMediaManager'
import styles from './DeviceDropdown.module.sass'

interface DeviceDropdownProps {
  kind: 'audio' | 'video'
  direction?: 'up' | 'down'
}

export const DeviceDropdown = ({ kind, direction = 'down' }: DeviceDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const devices = useDevices()
  const selectedDevices = useSelectedDevices()
  const { switchDevice } = useMediaActions()

  const deviceList = kind === 'audio' ? devices.audio : devices.video
  const selectedId = kind === 'audio' ? selectedDevices.audioId : selectedDevices.videoId

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelect = useCallback(
    (deviceId: string) => {
      void switchDevice(kind, deviceId)
      setIsOpen(false)
    },
    [kind, switchDevice],
  )

  if (deviceList.length <= 1) return null

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={`Select ${kind} device`}
        type="button"
      >
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} ${direction === 'up' ? styles.dropdownUp : styles.dropdownDown}`}>
          {deviceList.map(device => (
            <button
              key={device.deviceId}
              className={`${styles.option} ${device.deviceId === selectedId ? styles.optionSelected : ''}`}
              onClick={() => handleSelect(device.deviceId)}
              type="button"
            >
              {device.deviceId === selectedId && <Check size={12} className={styles.checkIcon} />}
              {device.label || `${kind === 'audio' ? 'Microphone' : 'Camera'} ${device.deviceId.slice(0, 8)}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
