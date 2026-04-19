export const ACHIEVEMENTS = {
  FIRST_LECTURE: {
    id: 'first_lecture',
    title: 'Getting Started',
    description: 'Recorded your first lecture',
    icon: 'star',
    color: '#FFD700',
    points: 10,
    condition: (userData) => userData.lectureCount >= 1,
  },
  WEEK_STREAK: {
    id: 'week_streak',
    title: '7 Day Warrior',
    description: 'Studied for 7 days straight',
    icon: 'local-fire-department',
    color: '#FF6B6B',
    points: 50,
    condition: (userData) => userData.streak >= 7,
  },
  EARLY_BIRD: {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Studied before 8 AM',
    icon: 'wb-sunny',
    color: '#FFD93D',
    points: 25,
        condition: (userData) => {
          const hour = new Date(userData.lastStudyTime).getHours();
          return hour < 8;
        },
      },
    };

    export default ACHIEVEMENTS;