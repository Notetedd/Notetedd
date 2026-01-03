
import React, { createContext, useState, useContext } from 'react';

const StudyContext = createContext();

export const StudyProvider = ({ children }) => {
  const [streak, setStreak] = useState(3);
  const [totalHours, setTotalHours] = useState(12.5);
  const [lectures, setLectures] = useState([]);
  
  const addLecture = (lecture) => {
    setLectures(prev => [lecture, ...prev]);
  };
  
  const updateStreak = () => {
    setStreak(prev => prev + 1);
  };
  
  return (
    <StudyContext.Provider value={{
      streak,
      totalHours,
      lectures,
      addLecture,
      updateStreak,
    }}>
      {children}
    </StudyContext.Provider>
  );
};

export  const useStudy = () => useContext(StudyContext);

export default StudyContext;