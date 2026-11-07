import { Attributes, namedSlots$, QUICK_SAVE_KEY, recoveryIndex } from '@qspider/game-state';
import i18n from '@qspider/i18n';
import { useAtom } from '@xoid/react';
import React, { ReactElement, ReactNode, useContext } from 'react';
import { atom } from 'xoid';
import { useAttributes } from '../../content/attributes';
import { namedSlotContentContext, QspNamedSlot } from './named-slot';

const listedSaves$ = atom((get) =>
  get(namedSlots$)
    .filter((save) => save.key !== QUICK_SAVE_KEY)
    .sort((a, b) => b.timestamp - a.timestamp),
);

export const QspNamedSavesList: React.FC<{ attrs: Attributes; heading?: string; children: ReactNode }> = ({
  attrs,
  heading,
  children,
}) => {
  const saves = useAtom(listedSaves$);
  const [Tag, style, attributes] = useAttributes(attrs, 'qsp-named-saves-list');
  if (saves.length === 0) return null;
  return (
    <Tag style={style} {...attributes}>
      {heading ? <h4>{i18n.t(heading)}</h4> : null}
      {saves.map((save) => (
        <QspNamedSlot key={save.key} path={save.key} attrs={{}}>
          {React.Children.map(children, (child) => React.cloneElement(child as ReactElement))}
        </QspNamedSlot>
      ))}
    </Tag>
  );
};

export const QspSaveName: React.FC<{ attrs: Attributes }> = ({ attrs }) => {
  const { path } = useContext(namedSlotContentContext);
  const [Tag, style, attributes] = useAttributes(attrs, 'qsp-save-name');
  const index = recoveryIndex(path);
  const label = index === null ? path : `${i18n.t('Recovery')} ${index}`;
  return (
    <Tag {...attributes} style={style}>
      {label}
    </Tag>
  );
};
