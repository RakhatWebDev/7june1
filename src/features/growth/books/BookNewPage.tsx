import { useNavigate } from 'react-router'
import { PageHeader } from '../../../components/ui'
import { BookForm } from './BookForm'

export function BookNewPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Новая книга" back="/books" />
      <BookForm onSaved={(id) => navigate(`/books/${id}`, { replace: true })} />
    </>
  )
}
