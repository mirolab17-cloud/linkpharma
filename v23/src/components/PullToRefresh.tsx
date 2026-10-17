import React from 'react';
interface PullToRefreshProps { onRefresh?: () => Promise<void> | void; children: React.ReactNode; }
/** لا نضيف مستمعي لمس عامين حتى يعمل التمرير بإصبع واحد على Android وiOS. */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children }) => <>{children}</>;
