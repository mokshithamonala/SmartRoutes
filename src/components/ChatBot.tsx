import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useAction } from "../lib/convexAdapter";
import { api } from "../../convex/_generated/api";

export function ChatBot() {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatSession = useQuery(api.chat.getChatSession);
  const sendMessage = useMutation(api.chat.sendMessage);
  const generateBotResponse = useAction(api.chat.generateBotResponse);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatSession?.messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const userMessage = message;
    setMessage("");
    setIsTyping(true);

    try {
      const session = await sendMessage({ message: userMessage });
      
      // Generate bot response
      setTimeout(async () => {
        await generateBotResponse({
          message: userMessage,
          sessionId: session as any,
        });
        setIsTyping(false);
      }, 1000);
    } catch (error) {
      setIsTyping(false);
    }
  };

  const quickActions = [
    { text: "Find best route", icon: "🗺️" },
    { text: "Check parking availability", icon: "🅿️" },
    { text: "Traffic conditions", icon: "🚦" },
    { text: "Emergency alerts", icon: "🚨" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Traffic Assistant</h2>
        <p className="text-gray-600">Get instant help with routes, parking, and traffic information</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        {/* Chat Messages */}
        <div className="h-96 overflow-y-auto p-4 space-y-4">
          {!chatSession?.messages?.length ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">🤖</div>
              <p className="text-gray-500 mb-4">Hi! I'm your AI traffic assistant.</p>
              <p className="text-sm text-gray-400">Ask me about routes, parking, or traffic conditions!</p>
            </div>
          ) : (
            chatSession.messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}>
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-900 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        {!chatSession?.messages?.length && (
          <div className="border-t border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-3">Quick actions:</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.text}
                  onClick={() => setMessage(action.text)}
                  className="flex items-center space-x-2 p-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <span>{action.icon}</span>
                  <span>{action.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Input */}
        <div className="border-t border-gray-200 p-4">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask me anything about traffic, routes, or parking..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!message.trim() || isTyping}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* AI Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
          <div className="text-2xl mb-2">🧠</div>
          <h3 className="font-semibold text-blue-900">Smart Routing</h3>
          <p className="text-sm text-blue-700">AI analyzes traffic patterns to suggest optimal routes</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold text-green-900">Predictive Analytics</h3>
          <p className="text-sm text-green-700">Forecast traffic conditions and parking availability</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
          <div className="text-2xl mb-2">🎯</div>
          <h3 className="font-semibold text-purple-900">Personalized Suggestions</h3>
          <p className="text-sm text-purple-700">Learn your preferences for better recommendations</p>
        </div>
      </div>
    </div>
  );
}
