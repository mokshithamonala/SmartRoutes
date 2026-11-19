import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useAction } from "../lib/convexAdapter";
import { api } from "../../convex/_generated/api";

export function EnhancedChatBot() {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatSession = useQuery(api.chat.getChatSession);
  const sendMessage = useMutation(api.chat.sendMessage);
  const addBotResponse = useMutation(api.chat.addBotResponse);
  const generateResponse = useAction(api.aiChatbot.generateIntelligentResponse);

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
      const sessionId = await sendMessage({ message: userMessage });
      
      // Generate AI response with context
      setTimeout(async () => {
        try {
          const aiResponse = await generateResponse({
            message: userMessage,
            context: {
              trafficConditions: "moderate",
            }
          });
          
          // Add AI response to chat
          await addBotResponse({ sessionId, response: aiResponse });
        } catch (error) {
          console.error("AI response failed:", error);
        } finally {
          setIsTyping(false);
        }
      }, 1000);
    } catch (error) {
      setIsTyping(false);
    }
  };

  const quickActions = [
    { text: "Find fastest route to downtown", icon: "🚀", category: "routing" },
    { text: "Check parking near me", icon: "🅿️", category: "parking" },
    { text: "Current traffic conditions", icon: "🚦", category: "traffic" },
    { text: "Emergency vehicle alerts", icon: "🚨", category: "emergency" },
    { text: "Best time to travel", icon: "⏰", category: "timing" },
    { text: "Fuel-efficient routes", icon: "⛽", category: "eco" },
  ];

  const handleQuickAction = (actionText: string) => {
    setMessage(actionText);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Traffic Assistant</h2>
        <p className="text-gray-600">Powered by advanced AI for intelligent traffic management assistance</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-lg">🤖</span>
            </div>
            <div>
              <h3 className="font-semibold">Smart Traffic AI</h3>
              <p className="text-sm opacity-90">Online • Ready to help</p>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {!chatSession?.messages?.length ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">👋</div>
              <p className="text-gray-600 mb-4 text-lg">Hello! I'm your AI traffic assistant.</p>
              <p className="text-sm text-gray-500 mb-6">I can help you with routes, parking, traffic conditions, and more!</p>
              
              {/* AI Capabilities */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <div className="text-2xl mb-1">🧠</div>
                  <p className="text-xs font-medium text-blue-900">Smart Routing</p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <div className="text-2xl mb-1">📊</div>
                  <p className="text-xs font-medium text-green-900">Traffic Analysis</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <div className="text-2xl mb-1">🎯</div>
                  <p className="text-xs font-medium text-purple-900">Personalized</p>
                </div>
              </div>
            </div>
          ) : (
            chatSession.messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg shadow-sm ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                    : "bg-white text-gray-900 border border-gray-200"
                }`}>
                  {msg.role === "assistant" && (
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm">🤖</span>
                      <span className="text-xs font-medium text-gray-500">AI Assistant</span>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <p className={`text-xs mt-2 ${msg.role === "user" ? "text-blue-100" : "text-gray-400"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-900 max-w-xs lg:max-w-md px-4 py-3 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs font-medium text-gray-500">AI Assistant</span>
                </div>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        {!chatSession?.messages?.length && (
          <div className="border-t border-gray-200 p-4 bg-white">
            <p className="text-sm text-gray-600 mb-3 font-medium">Quick Actions:</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.text}
                  onClick={() => handleQuickAction(action.text)}
                  className="flex items-center space-x-2 p-3 text-left text-sm bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-gray-200 rounded-lg transition-all"
                >
                  <span className="text-lg">{action.icon}</span>
                  <span className="flex-1">{action.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Input */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <form onSubmit={handleSendMessage} className="flex space-x-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask me about traffic, routes, parking, or anything else..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!message.trim() || isTyping}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95"
            >
              <span className="text-lg">🚀</span>
            </button>
          </form>
        </div>
      </div>

      {/* AI Features Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
          <div className="text-3xl mb-3">🧠</div>
          <h3 className="font-semibold text-blue-900 mb-2">Machine Learning</h3>
          <p className="text-sm text-blue-700">Advanced algorithms analyze traffic patterns and predict optimal routes in real-time.</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
          <div className="text-3xl mb-3">📊</div>
          <h3 className="font-semibold text-green-900 mb-2">Predictive Analytics</h3>
          <p className="text-sm text-green-700">Forecast traffic conditions, parking availability, and travel times with 95% accuracy.</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200">
          <div className="text-3xl mb-3">🎯</div>
          <h3 className="font-semibold text-purple-900 mb-2">Personalization</h3>
          <p className="text-sm text-purple-700">Learn your preferences and habits to provide tailored recommendations.</p>
        </div>
      </div>
    </div>
  );
}
