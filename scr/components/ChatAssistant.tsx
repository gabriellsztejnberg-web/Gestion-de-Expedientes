
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { askDatabase } from '../services/geminiService';

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
}

export const ChatAssistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'model', text: 'Hola, soy el asistente de División Planes. Puedo responder consultas sobre expedientes, movimientos o personal. ¿En qué te ayudo?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Data Cache for Context
    const [contextData, setContextData] = useState('');

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    // Cargar datos al abrir el chat para tener contexto fresco
    useEffect(() => {
        if (isOpen) {
            loadContext();
        }
    }, [isOpen]);

    const loadContext = async () => {
        try {
            // OPTIMIZACIÓN: Reducimos límites para evitar "Error de conexión" por payload excesivo
            // 1. Expedientes Activos (Limitamos a 15 más recientes/relevantes)
            const qExp = query(collection(db, 'expedientes'), limit(15)); 
            const snapExp = await getDocs(qExp);
            const expedientes = snapExp.docs.map(d => {
                const data = d.data();
                return {
                    gde: data.numero,
                    empresa: data.empresa,
                    tramite: data.tramite,
                    estado: data.instancia,
                    asignado_a: data.asignadoANombre,
                    ubicacion: data.instancia === 'pase' ? `PASE A ${data.destinoExterno}` : 'Oficina'
                };
            });

            // 2. Movimientos Recientes (Últimos 10)
            const qMov = query(collection(db, 'movimientos'), orderBy('fecha', 'desc'), limit(10));
            const snapMov = await getDocs(qMov);
            const movimientos = snapMov.docs.map(d => {
                const data = d.data();
                return {
                    fecha: data.fecha,
                    usuario: data.usuario,
                    accion: data.texto,
                    tipo: data.tipoAccion
                };
            });

            // 3. Usuarios (Solo nombres y roles, data mínima)
            const qUsers = query(collection(db, 'usuarios'));
            const snapUsers = await getDocs(qUsers);
            const usuarios = snapUsers.docs.map(d => ({ nombre: d.data().name, rol: d.data().role }));

            const contextString = JSON.stringify({
                expedientes_resumen: expedientes,
                ultimos_movimientos: movimientos,
                personal: usuarios
            });

            setContextData(contextString);
        } catch (e) {
            console.error("Error loading chat context", e);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        const responseText = await askDatabase(input, contextData);

        const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: responseText };
        setMessages(prev => [...prev, modelMsg]);
        setLoading(false);
    };

    return (
        <>
            {/* FAB BUTTON */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95 flex items-center justify-center
                    ${isOpen ? 'bg-slate-800 rotate-90' : 'bg-gradient-to-r from-purple-600 to-indigo-600 animate-bounce-slow'}`}
            >
                <span className="material-symbols-outlined text-white text-2xl">
                    {isOpen ? 'close' : 'smart_toy'}
                </span>
            </button>

            {/* CHAT WINDOW */}
            {isOpen && (
                <div className="fixed bottom-24 right-4 left-4 md:left-auto md:right-6 md:w-96 h-[500px] max-h-[70vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col z-50 overflow-hidden animate-fade-in-up">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex items-center gap-3 shrink-0">
                        <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
                            <span className="material-symbols-outlined text-white text-xl">psychology</span>
                        </div>
                        <div>
                            <h3 className="text-white font-black uppercase text-sm tracking-wide">Asistente DPAM</h3>
                            <p className="text-purple-200 text-[10px] font-bold uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                                Conectado a Base de Datos
                            </p>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-medium leading-relaxed shadow-sm
                                    ${msg.role === 'user' 
                                        ? 'bg-indigo-600 text-white rounded-br-none' 
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-none border border-slate-100 dark:border-slate-700'
                                    }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-100 dark:border-slate-700 flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2 shrink-0">
                        <input 
                            className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none text-slate-800 dark:text-white"
                            placeholder="Preguntame sobre expedientes..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            disabled={loading}
                        />
                        <button 
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white p-2 rounded-xl transition-colors flex items-center justify-center shadow-md"
                        >
                            <span className="material-symbols-outlined text-lg">send</span>
                        </button>
                    </form>
                </div>
            )}
        </>
    );
};
