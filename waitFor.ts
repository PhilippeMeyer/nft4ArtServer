export const waitFor = (conditionFunction: () => boolean) =>
    new Promise<void>((resolve) => {
        const interval = setInterval(() => {
            if (conditionFunction()) {
                clearInterval(interval);
                resolve();
            }
        }, 500);
    });
