import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as commands from '../../commands'
import EntryList from './EntryList'

export default function LabelEntries() {
  const { labelId } = useParams<{ labelId: string }>()
  const [labelName, setLabelName] = useState('')

  useEffect(() => {
    if (!labelId) return
    commands
      .listLabels()
      .then((labels) => {
        const found = labels.find((l) => l.id === labelId)
        if (found) setLabelName(found.name)
      })
      .catch(() => {})
  }, [labelId])

  return <EntryList labelId={labelId} labelName={labelName} />
}
