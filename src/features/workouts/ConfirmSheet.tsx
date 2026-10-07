import { Button, Sheet } from '../../components/ui'

/** Small confirmation dialog built on the shared Sheet. */
export function ConfirmSheet({
  open,
  title,
  text,
  confirmLabel = 'Удалить',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  text?: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {text && <p className="mb-4 text-sm text-muted">{text}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}
