import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Bot, Check, CheckCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAuthStore } from '@/stores/auth-store'
import type { ChatMessage } from '@/types'
import { format } from 'date-fns'

interface RealtimeChatProps {
  sessionId: string
  className?: string
  maxHeight?: string
}

/**
 * RealtimeChat Component
 *
 * Features:
 * - Message list with timestamps
 * - Message input and send button
 * - System messages (participant joined/left)
 * - Typing indicators
 * - Message delivery status
 * - Auto-scroll to latest
 * - Emoji support
 * - Integration with WebSocket 'chat:message' events
 */
export function RealtimeChat({
  sessionId,
  className,
  maxHeight = '500px',
}: RealtimeChatProps) {
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { user } = useAuthStore()
  const { addChatMessage, getMessagesForSession } = useRealtimeStore()
  const { emit, subscribe, isConnected } = useWebSocket({ sessionId })

  // Get messages for current session
  const sessionMessages = getMessagesForSession(sessionId)

  /**
   * Subscribe to chat messages and typing events
   */
  useEffect(() => {
    const unsubscribeMessage = subscribe<ChatMessage>('chat:message', (msg) => {
      if (msg.sessionId === sessionId) {
        // Auto-scroll to latest message
        setTimeout(() => {
          scrollToBottom()
        }, 100)
      }
    })

    const unsubscribeTyping = subscribe<{ userId: string; userName: string; isTyping: boolean }>(
      'chat:typing',
      (data) => {
        setTypingUsers((prev) => {
          const next = new Set(prev)
          if (data.isTyping) {
            next.add(data.userName)
          } else {
            next.delete(data.userName)
          }
          return next
        })
      }
    )

    return () => {
      unsubscribeMessage()
      unsubscribeTyping()
    }
  }, [subscribe, sessionId])

  /**
   * Auto-scroll to bottom on mount and when messages change
   */
  useEffect(() => {
    scrollToBottom()
  }, [sessionMessages.length])

  /**
   * Scroll to bottom of chat
   */
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [])

  /**
   * Send typing indicator
   */
  const sendTypingIndicator = useCallback(
    (typing: boolean) => {
      if (!isConnected || !user) return

      emit('chat:typing', {
        sessionId,
        userId: user.id,
        userName: user.name,
        isTyping: typing,
      })
    },
    [emit, isConnected, user, sessionId]
  )

  /**
   * Handle input change
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMessage(e.target.value)

      // Send typing indicator
      if (!isTyping) {
        setIsTyping(true)
        sendTypingIndicator(true)
      }

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      // Stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false)
        sendTypingIndicator(false)
      }, 2000)
    },
    [isTyping, sendTypingIndicator]
  )

  /**
   * Send message
   */
  const handleSendMessage = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()

      if (!message.trim() || !isConnected || !user) return

      // Create message object
      const chatMessage: ChatMessage = {
        id: `${Date.now()}-${user.id}`,
        sessionId,
        senderId: user.id,
        senderName: user.name,
        content: message.trim(),
        type: 'user',
        timestamp: new Date().toISOString(),
        delivered: false,
        read: false,
      }

      // Add to store immediately (optimistic update)
      addChatMessage(chatMessage)

      // Emit to server
      emit('chat:message', chatMessage)

      // Clear input and typing state
      setMessage('')
      setIsTyping(false)
      sendTypingIndicator(false)

      // Clear timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      // Focus input
      inputRef.current?.focus()
    },
    [message, isConnected, user, sessionId, addChatMessage, emit, sendTypingIndicator]
  )

  /**
   * Get message timestamp
   */
  const getMessageTime = (timestamp: string): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Less than 1 minute ago
    if (diff < 60000) {
      return 'Just now'
    }

    // Less than 1 hour ago
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return `${minutes}m ago`
    }

    // Today
    if (format(date, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) {
      return format(date, 'HH:mm')
    }

    // This year
    if (date.getFullYear() === now.getFullYear()) {
      return format(date, 'MMM d, HH:mm')
    }

    // Other
    return format(date, 'MMM d, yyyy HH:mm')
  }

  /**
   * Get user initials
   */
  const getUserInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-3">
        <CardTitle>Chat</CardTitle>
        <CardDescription>
          {isConnected ? (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Disconnected
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 p-0">
        {/* Messages */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-6" style={{ height: maxHeight }}>
          <div className="space-y-4 pb-4">
            {sessionMessages.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                No messages yet
              </div>
            ) : (
              sessionMessages.map((msg) => {
                const isOwnMessage = msg.senderId === user?.id
                const isSystemMessage = msg.type === 'system'

                if (isSystemMessage) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {msg.content}
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={msg.id}
                    className={cn('flex gap-3', isOwnMessage && 'flex-row-reverse')}
                  >
                    {/* Avatar */}
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={cn(isOwnMessage && 'bg-primary text-primary-foreground')}>
                        {getUserInitials(msg.senderName)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Message Bubble */}
                    <div
                      className={cn(
                        'flex max-w-[70%] flex-col gap-1',
                        isOwnMessage && 'items-end'
                      )}
                    >
                      <div className="text-xs font-medium">{msg.senderName}</div>
                      <div
                        className={cn(
                          'rounded-lg px-3 py-2 text-sm',
                          isOwnMessage
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        )}
                      >
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{getMessageTime(msg.timestamp)}</span>
                        {isOwnMessage && (
                          <>
                            {msg.read ? (
                              <CheckCheck className="h-3 w-3" />
                            ) : msg.delivered ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Check className="h-3 w-3 opacity-50" />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}

            {/* Typing Indicators */}
            {typingUsers.size > 0 && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
                      style={{ animationDelay: '0.2s' }}
                    />
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
                      style={{ animationDelay: '0.4s' }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Array.from(typingUsers).join(', ')} typing...
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t px-6 pb-6 pt-4">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              ref={inputRef}
              value={message}
              onChange={handleInputChange}
              placeholder="Type a message..."
              disabled={!isConnected}
              className="flex-1"
            />
            <Button type="submit" disabled={!message.trim() || !isConnected}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
