import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/session-store'
import { stripUndefined } from '@/lib/utils'
import { createSessionSchema, type CreateSessionFormData } from '@/lib/validations'
import { QUESTION_TYPES, DIFFICULTY_LEVELS } from '@/lib/constants'
import { Loader2, Plus, Trash2, GripVertical, Eye } from 'lucide-react'
import type { QuestionType, DifficultyLevel } from '@/types'

export function CreateSessionPage() {
  const navigate = useNavigate()
  const { createSession, isLoading } = useSessionStore()
  const [showPreview, setShowPreview] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CreateSessionFormData>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      title: '',
      description: '',
      candidateName: '',
      candidateEmail: '',
      scheduledAt: '',
      duration: 60,
      position: '',
      department: '',
      questions: [
        {
          content: '',
          type: 'free_text',
          difficulty: 'medium',
        },
      ],
      settings: {
        enableRecording: true,
        enableAiDetection: true,
        enableEyeTracking: false,
        sendEmailInvitation: true,
      },
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'questions',
  })

  const settings = watch('settings')
  const questions = watch('questions')

  const onSubmit = async (data: CreateSessionFormData) => {
    // Strip undefined values for exactOptionalPropertyTypes compliance
    // Cast needed because RHF returns `| undefined` for optional fields
    const cleanData = stripUndefined(data as Record<string, unknown>) as CreateSessionFormData
    const result = await createSession(cleanData)

    if (result.success) {
      toast.success('Session created', {
        description: 'The interview session has been created successfully.',
      })
      navigate(`/sessions/${result.sessionId}`)
    } else {
      toast.error('Failed to create session', {
        description: 'Please check the form and try again.',
      })
    }
  }

  const addQuestion = () => {
    append({
      content: '',
      type: 'free_text',
      difficulty: 'medium',
    })
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Interview Session</h1>
          <p className="text-muted-foreground mt-2">
            Set up a new interview session with AI-powered monitoring
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
          <Eye className="mr-2 h-4 w-4" />
          {showPreview ? 'Edit' : 'Preview'}
        </Button>
      </div>

      {showPreview ? (
        <Card>
          <CardHeader>
            <CardTitle>Session Preview</CardTitle>
            <CardDescription>Review your session details before creating</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Basic Information</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Title:</dt>
                  <dd className="font-medium">{watch('title') || 'Not set'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Candidate:</dt>
                  <dd className="font-medium">{watch('candidateName') || 'Not set'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Email:</dt>
                  <dd className="font-medium">{watch('candidateEmail') || 'Not set'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Duration:</dt>
                  <dd className="font-medium">{watch('duration')} minutes</dd>
                </div>
              </dl>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Questions ({questions.length})</h3>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="p-3 border rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-sm">Q{i + 1}:</span>
                      <span className="text-sm">{q.content || 'No question text'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Session Settings</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Recording: {settings.enableRecording ? 'Enabled' : 'Disabled'}</div>
                <div>AI Detection: {settings.enableAiDetection ? 'Enabled' : 'Disabled'}</div>
                <div>Eye Tracking: {settings.enableEyeTracking ? 'Enabled' : 'Disabled'}</div>
                <div>Email Invitation: {settings.sendEmailInvitation ? 'Yes' : 'No'}</div>
              </div>
            </div>

            <Button onClick={() => setShowPreview(false)} className="w-full">
              Back to Editing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter the basic details for the interview session</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="title">Session Title *</Label>
                  <Input
                    id="title"
                    placeholder="Frontend Developer Interview - John Doe"
                    {...register('title')}
                    disabled={isLoading}
                  />
                  {errors.title && (
                    <p className="text-sm text-red-500">{errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the interview session..."
                    {...register('description')}
                    disabled={isLoading}
                  />
                  {errors.description && (
                    <p className="text-sm text-red-500">{errors.description.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="candidateName">Candidate Name *</Label>
                  <Input
                    id="candidateName"
                    placeholder="John Doe"
                    {...register('candidateName')}
                    disabled={isLoading}
                  />
                  {errors.candidateName && (
                    <p className="text-sm text-red-500">{errors.candidateName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="candidateEmail">Candidate Email *</Label>
                  <Input
                    id="candidateEmail"
                    type="email"
                    placeholder="john@example.com"
                    {...register('candidateEmail')}
                    disabled={isLoading}
                  />
                  {errors.candidateEmail && (
                    <p className="text-sm text-red-500">{errors.candidateEmail.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduledAt">Scheduled Date & Time *</Label>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    {...register('scheduledAt')}
                    disabled={isLoading}
                  />
                  {errors.scheduledAt && (
                    <p className="text-sm text-red-500">{errors.scheduledAt.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="15"
                    max="240"
                    {...register('duration', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  {errors.duration && (
                    <p className="text-sm text-red-500">{errors.duration.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Position</Label>
                  <Input
                    id="position"
                    placeholder="Frontend Developer"
                    {...register('position')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    placeholder="Engineering"
                    {...register('department')}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Questions</CardTitle>
                  <CardDescription>Add and configure interview questions</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">Question {index + 1}</span>
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`questions.${index}.content`}>Question Text *</Label>
                    <Textarea
                      id={`questions.${index}.content`}
                      placeholder="Enter your question here..."
                      {...register(`questions.${index}.content`)}
                      disabled={isLoading}
                    />
                    {errors.questions?.[index]?.content && (
                      <p className="text-sm text-red-500">
                        {errors.questions[index]?.content?.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`questions.${index}.type`}>Type *</Label>
                      <Select
                        value={watch(`questions.${index}.type`)}
                        onValueChange={(value) =>
                          setValue(`questions.${index}.type`, value as QuestionType)
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={QUESTION_TYPES.FREE_TEXT}>Free Text</SelectItem>
                          <SelectItem value={QUESTION_TYPES.MULTIPLE_CHOICE}>
                            Multiple Choice
                          </SelectItem>
                          <SelectItem value={QUESTION_TYPES.CODING}>Coding</SelectItem>
                          <SelectItem value={QUESTION_TYPES.BEHAVIORAL}>Behavioral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`questions.${index}.difficulty`}>Difficulty *</Label>
                      <Select
                        value={watch(`questions.${index}.difficulty`)}
                        onValueChange={(value) =>
                          setValue(`questions.${index}.difficulty`, value as DifficultyLevel)
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DIFFICULTY_LEVELS.EASY}>Easy</SelectItem>
                          <SelectItem value={DIFFICULTY_LEVELS.MEDIUM}>Medium</SelectItem>
                          <SelectItem value={DIFFICULTY_LEVELS.HARD}>Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              {errors.questions && !Array.isArray(errors.questions) && (
                <p className="text-sm text-red-500">{errors.questions.message}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Settings</CardTitle>
              <CardDescription>Configure monitoring and notification settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enableRecording">Enable Recording</Label>
                  <p className="text-sm text-muted-foreground">
                    Record video and audio of the session
                  </p>
                </div>
                <Switch
                  id="enableRecording"
                  checked={settings.enableRecording}
                  onCheckedChange={(checked) =>
                    setValue('settings.enableRecording', checked)
                  }
                  disabled={isLoading}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enableAiDetection">Enable AI Detection</Label>
                  <p className="text-sm text-muted-foreground">
                    Detect AI-generated responses using advanced algorithms
                  </p>
                </div>
                <Switch
                  id="enableAiDetection"
                  checked={settings.enableAiDetection}
                  onCheckedChange={(checked) =>
                    setValue('settings.enableAiDetection', checked)
                  }
                  disabled={isLoading}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enableEyeTracking">Enable Eye Tracking</Label>
                  <p className="text-sm text-muted-foreground">
                    Track candidate's gaze and attention patterns
                  </p>
                </div>
                <Switch
                  id="enableEyeTracking"
                  checked={settings.enableEyeTracking}
                  onCheckedChange={(checked) =>
                    setValue('settings.enableEyeTracking', checked)
                  }
                  disabled={isLoading}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sendEmailInvitation">Send Email Invitation</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically send invitation email to the candidate
                  </p>
                </div>
                <Switch
                  id="sendEmailInvitation"
                  checked={settings.sendEmailInvitation}
                  onCheckedChange={(checked) =>
                    setValue('settings.sendEmailInvitation', checked)
                  }
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/sessions')}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Session'
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
