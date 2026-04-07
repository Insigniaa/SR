import { DEFAULT_COLORS } from './config.js';

export function formatTime(seconds, isCountdown = false) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    if (isCountdown) {
        return `-${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Zojuist';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m geleden`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}u geleden`;
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTimeAgo(timestamp) {
    return formatTimestamp(timestamp);
}

export function formatShowTime(startHour, endHour) {
    const formatHour = (hour) => {
        return `${hour.toString().padStart(2, '0')}:00`;
    };

    return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}

export function capitalizeFirstLetter(string) {
    const days = {
        'sun': 'Zondag',
        'mon': 'Maandag',
        'tue': 'Dinsdag',
        'wed': 'Woensdag',
        'thu': 'Donderdag',
        'fri': 'Vrijdag',
        'sat': 'Zaterdag'
    };
    return days[string] || string;
}

export function isSuperRadioTrack(artistName) {
    if (!artistName) return false;

    const normalized = artistName.toLowerCase().replace(/\s+/g, ' ').trim();

    const patterns = [
        'super-radio',
        'super radio',
        'super - radio',
        'superradio',
        'super -radio',
        'Super- Radio',
        'super- radio',
        'SOUL MOTOWN AND DANCE CLASSICS +',
        'soul motown and dance classics +',
        'soul motown and dance classics+',
        'soul motown and dance classics',
        'SOULMOTOWNANDDANCECLASSICS+',
        'soulmotownanddanceclassics+',
        'soulmotownanddanceclassics',
        'Dionna Warwick,Stevie Wonder,L.T.D,Kool & The Gang'
    ];

    return patterns.some(pattern => normalized.includes(pattern.toLowerCase()));
}

export function generateDefaultImage(text, type = 'track') {
    let colors;
    switch (type) {
        case 'artist':
            colors = `${DEFAULT_COLORS.secondary}/${DEFAULT_COLORS.primary}`;
            break;
        case 'album':
            colors = `${DEFAULT_COLORS.accent}/${DEFAULT_COLORS.dark}`;
            break;
        default: // track
            colors = `${DEFAULT_COLORS.primary}/${DEFAULT_COLORS.dark}`;
    }

    const formattedText = encodeURIComponent(`🎵\n${text}`);
    return `https://placehold.co/400x400/${colors}?text=${formattedText}&font=montserrat`;
}

export function getRelativeTimeString(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) {
        return 'Just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }

    return date.toLocaleTimeString();
}
