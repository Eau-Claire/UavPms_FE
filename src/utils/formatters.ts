import dayjs from 'dayjs';

export const formatDate = (date: string | Date): string => {
  return dayjs(date).format('DD/MM/YYYY');
};

export const formatDateTime = (date: string | Date): string => {
  return dayjs(date).format('DD/MM/YYYY HH:mm:ss');
};

export const getInitials = (fullName: string): string => {
  return fullName
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
