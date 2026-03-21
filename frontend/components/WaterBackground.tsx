import React from 'react';

export const WaterBackground = () => {
    return (
        <>
            <div className="absolute inset-0 z-0 opacity-10 dark:opacity-40 pointer-events-none transition-opacity duration-300">
                <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-hydro-primary/30 rounded-full blur-[100px] animate-flow"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-hydro-secondary/20 rounded-full blur-[120px] animate-flow" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {/* Abstract Waves */}
                <div className="absolute bottom-0 w-[200%] h-64 bg-gradient-to-t from-hydro-primary/5 dark:from-hydro-primary/10 to-transparent blur-3xl transform -translate-x-1/2 left-1/2 transition-opacity duration-300"></div>
            </div>
        </>
    );
};
