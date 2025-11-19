'use client';

import { useState, useRef, useEffect } from 'react';

interface PINInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string;
}

export default function PINInput({ length = 4, onComplete, disabled = false, error }: PINInputProps) {
  const [pin, setPin] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (disabled) return;
    
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto-focus next input
    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if all inputs are filled
    if (newPin.every(digit => digit !== '') && newPin.join('').length === length) {
      onComplete(newPin.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, length);
    if (/^\d+$/.test(pastedData)) {
      const newPin = [...pin];
      for (let i = 0; i < pastedData.length && i < length; i++) {
        newPin[i] = pastedData[i];
      }
      setPin(newPin);
      if (pastedData.length === length) {
        onComplete(pastedData);
      } else {
        inputRefs.current[Math.min(pastedData.length, length - 1)]?.focus();
      }
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-center gap-2 sm:gap-3">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={pin[index]}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={disabled}
            className={`
              w-12 h-12 sm:w-14 sm:h-14 text-center text-2xl font-bold
              border-2 rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-all
              ${error ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'}
            `}
          />
        ))}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}

