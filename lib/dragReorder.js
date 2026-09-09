import { useEffect, useLayoutEffect, useRef, useState } from "react";

// タスク管理モーダルの一覧のドラッグ&ドロップ並び替えを担うフック。
// animator-workspace-app の components/cutShared/useDragReorder.js + lib/listOrdering.js
// (Cut一覧・案件一覧のドラッグ並び替え)を、このアプリ向けに簡略化して移植したもの。
// 複数選択・編集モードの概念はroutine-appには無いため、常に単一項目のみを動かす形にしている。
//
// 掴んだ項目はポインタにそのまま追従させて半透明で浮かせ(pointer-events: noneでヒットテストを
// 妨げないようにする)、それ以外の項目は実際に配列の並び順(previewIds)を入れ替えてレイアウトを
// 動かすことで、ドロップ先に隙間ができるようにする。並び替え直後の見た目のジャンプはFLIP法
// (要素の旧位置からtransformで巻き戻し、次フレームでtransitionをかけて0へ戻す)で
// スライドアニメーションに変換している。
//
// 掴んでいる項目自身のtransformはReactのstateを介さず、pointermoveのたびにDOMへ直接書き込む
// (dragOffsetRef)。Reactのstate/再レンダリング経由にすると、並び替え(previewIds変更)と
// ポインタ追従分のtransform更新が同じレンダーにバッチされてしまい、並び替え直後の「あるべき自然位置」を
// 正しく測れず、飛んで見える瞬間が生まれる。DOM直書きにすることで、並び替えの前後で実測した
// 自然位置のズレ分だけtransformを補正でき(ゼロにリセットするのではなく)、ポインタへの追従が
// 常に連続的になる。

// ドラッグ中のプレビュー表示用に、dragIdをdropIdの直前(after=false)または直後(after=true)へ
// 移動する。afterを扱えるようにしておかないと、一番下の項目の下側にカーソルがあっても
// 「一番下の項目の直前」までしか移動できず、最後尾へ入れ替えることができない。
export function moveIdsToPosition(ids, dragId, dropId, after) {
  if (dragId === dropId) return ids;
  const rest = ids.filter(id => id !== dragId);
  let dropIndex = rest.indexOf(dropId);
  if (dropIndex === -1) return ids;
  if (after) dropIndex += 1;
  const next = [...rest];
  next.splice(dropIndex, 0, dragId);
  return next;
}

export function useDragReorder({ ids, onCommit }) {
  const [dragId, setDragId] = useState(null);
  const [previewIds, setPreviewIds] = useState(null);
  const elRefs = useRef(new Map());
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const previewIdsRef = useRef(null);
  const flipRectsRef = useRef(null);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { onCommitRef.current = onCommit; });

  function registerRef(id) {
    return el => {
      if (el) elRefs.current.set(id, el);
      else elRefs.current.delete(id);
    };
  }

  function applyDragTransform(id) {
    const el = elRefs.current.get(id);
    if (el) el.style.transform = `translate(${dragOffsetRef.current.x}px, ${dragOffsetRef.current.y}px)`;
  }

  function handlePointerDown(e, id) {
    e.preventDefault();
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = { x: 0, y: 0 };
    const el = elRefs.current.get(id);
    if (el) el.style.transform = "";
    previewIdsRef.current = [...ids];
    setPreviewIds(previewIdsRef.current);
    setDragId(id);
  }

  useEffect(() => {
    if (dragId === null) return;
    let currentHoverId = dragId;
    let currentAfter = false;
    let pendingEvent = null;
    let rafId = null;

    // hitテスト(elementFromPoint)や並び替え時の全行分のgetBoundingClientRectは、いずれも
    // 同期的なレイアウト計算を伴う重い処理。素早くドラッグすると、これがpointermoveの発火頻度に
    // 追いつかず処理待ちが溜まり、結果としてポインタに追従できず遅れて見える(離れていく)原因になる。
    // そのため実際の重い処理はrequestAnimationFrameで1フレームに1回だけ、直近のポインタ位置を
    // 使って行うようにし、処理の取りこぼしによる遅延の蓄積を防ぐ。
    function processPending() {
      rafId = null;
      const e = pendingEvent;
      if (!e) return;
      pendingEvent = null;

      // ポインタの生の移動量をそのまま積み上げてDOMへ即座に反映するのを必ず先に行う。
      // これを並び替え判定より後にすると、並び替え直前に captureする「前」のrect(=まだ今回分の
      // 移動が反映されていないtransform)と、useLayoutEffect側で測る「後」のrect(=このprocessPending内で
      // 更新済みのtransform)がズレてしまい、今回分の移動量がそのまま相殺されて追従が遅れる。
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      dragOffsetRef.current = { x: dragOffsetRef.current.x + dx, y: dragOffsetRef.current.y + dy };
      applyDragTransform(dragId);

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const rowEl = el && el.closest("[data-row-id]");
      if (rowEl) {
        const hoverId = rowEl.getAttribute("data-row-id");
        // カーソルが対象行の上半分か下半分かで「直前に挿入」か「直後に挿入」かを切り替える。
        // これがないと一番下の項目へは常に「その直前」までしか移動できず、最後尾に置けなくなる。
        const rowRect = rowEl.getBoundingClientRect();
        const after = e.clientY > rowRect.top + rowRect.height / 2;
        if ((hoverId !== currentHoverId || after !== currentAfter) && hoverId !== dragId) {
          currentHoverId = hoverId;
          currentAfter = after;
          const rects = new Map();
          elRefs.current.forEach((elm, id) => rects.set(id, elm.getBoundingClientRect()));
          flipRectsRef.current = rects;
          previewIdsRef.current = moveIdsToPosition(previewIdsRef.current, dragId, hoverId, after);
          setPreviewIds(previewIdsRef.current);
        }
      }
    }

    function handleMove(e) {
      pendingEvent = e;
      if (rafId === null) rafId = requestAnimationFrame(processPending);
    }

    function finishDrag() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingEvent = null;
      const draggedEl = elRefs.current.get(dragId);
      if (draggedEl) draggedEl.style.transform = "";
      if (previewIdsRef.current) onCommitRef.current(previewIdsRef.current);
      setDragId(null);
      setPreviewIds(null);
      previewIdsRef.current = null;
      flipRectsRef.current = null;
      dragOffsetRef.current = { x: 0, y: 0 };
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragId]);

  useLayoutEffect(() => {
    const prevRects = flipRectsRef.current;
    if (!prevRects) return;
    flipRectsRef.current = null;

    // 掴んでいる項目自身: 並び替えで自然な配置位置が実際にどれだけ動いたかを前後の実測値の差から
    // 求め、その分だけtransformを逆方向に補正して見た目の位置を維持する(0へのリセットではないため、
    // 並び替えのたびに位置が飛ぶことがない)。
    if (dragId !== null) {
      const dragEl = elRefs.current.get(dragId);
      const prevDragRect = prevRects.get(dragId);
      if (dragEl && prevDragRect) {
        const newDragRect = dragEl.getBoundingClientRect();
        const shiftX = newDragRect.left - prevDragRect.left;
        const shiftY = newDragRect.top - prevDragRect.top;
        if (shiftX || shiftY) {
          dragOffsetRef.current = { x: dragOffsetRef.current.x - shiftX, y: dragOffsetRef.current.y - shiftY };
          applyDragTransform(dragId);
        }
      }
    }

    // 他の項目: FLIP法でスライドアニメーション
    elRefs.current.forEach((el, id) => {
      if (id === dragId) return;
      const prevRect = prevRects.get(id);
      if (!prevRect) return;
      const newRect = el.getBoundingClientRect();
      const dx = prevRect.left - newRect.left;
      const dy = prevRect.top - newRect.top;
      if (!dx && !dy) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = "transform 180ms ease";
        el.style.transform = "";
        // アニメーション終了後はinline transitionを外し、通常時のhover-*系クラスによる
        // color/background-colorのtransitionを邪魔しないようにする。
        setTimeout(() => el.style.removeProperty("transition"), 200);
      });
    });
  }, [previewIds, dragId]);

  return { dragId, previewIds, registerRef, handlePointerDown };
}
