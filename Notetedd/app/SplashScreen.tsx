import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { Mic, BookOpen } from "lucide-react";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/AuthScreen"); // Navigate to the Auth screen
    }, 2000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-purple-600 to-teal-500 flex flex-col items-center justify-center">
      <div className="animate-fade-in">
        <div className="flex items-center justify-center space-x-2 mb-6">
          <Mic size={40} className="text-white" />
          <BookOpen size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">LectureNote</h1>
        <p className="text-teal-100 text-center">Your Smart Study Companion</p>
      </div>
    </div>
  );
}
