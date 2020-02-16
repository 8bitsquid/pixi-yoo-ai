import {gsap} from "gsap";
import {Application, Container, Graphics, interaction} from "pixi.js";
import {PopupEvent} from "../..";
import {DisplayObjectWithSize} from "../display/DisplayObjectWithSize";
import InteractionEvent = interaction.InteractionEvent;

export class PopupManager {
  private get stageWidth(): number {
    return this.application.screen.width;
  }

  private get stageHeight(): number {
    return this.application.screen.height;
  }

  private static defaultOverlayFactory(): DisplayObjectWithSize {
    const quad = new Graphics();
    quad.beginFill(0x113322, 0.25);
    quad.drawRect(0, 0, 100, 100);
    quad.endFill();
    quad.interactive = true;
    return quad;
  }

  public overlayFactory?: () => DisplayObjectWithSize;

  private readonly _root: Container;
  private readonly _popups: Map<DisplayObjectWithSize, DisplayObjectWithSize | undefined> = new Map();
  private readonly _stack: DisplayObjectWithSize[] = [];

  private _activePopup?: DisplayObjectWithSize;

  public constructor(
    private readonly application: Application,
    root?: Container,
  ) {
    this._root = root === undefined ? application.stage : root;
  }

  public show(popup: DisplayObjectWithSize, params: IShowParams = {}) {
    const {isModal = true, isCentered = true, offsetX = 0, offsetY = 0, onComplete} = params;
    if (isModal && this._activePopup !== undefined) {
      this.pushInStack(this._activePopup);
    }
    let overlay: DisplayObjectWithSize | undefined;
    if (isModal) {
      const factory = this.overlayFactory || PopupManager.defaultOverlayFactory;
      overlay = factory();
      overlay.width = this.stageWidth;
      overlay.height = this.stageHeight;
      this._root.addChild(overlay);

      overlay.alpha = 0;
      gsap.to(overlay, {duration: 0.15, alpha: 1}).play();
    }

    popup.emit(PopupEvent.FOCUS_IN);
    this._root.addChild(popup);

    if (isCentered) {
      popup.x = (this.stageWidth - popup.width) * 0.5 + offsetX;
      popup.y = (this.stageHeight - popup.height) * 0.5 + offsetY;
    }

    popup.on("removed", this.onPopupRemoved, this);

    popup.alpha = 0;
    gsap.fromTo(
      popup, 0.175,
      {alpha: 0, y: popup.y + 20},
      {
        alpha: 1, y: popup.y, ease: "power2.out",
        onComplete,
      },
    ).play();

    this._popups.set(popup, overlay);
    if (isModal) {
      this._activePopup = popup;
    }
  }

  public hide(popup: DisplayObjectWithSize, destroy: boolean = false, onComplete?: () => void): void {
    if (this._popups.has(popup)) {
      popup.emit(PopupEvent.FOCUS_OUT);
      popup.off("removed", this.onPopupRemoved, this);

      const overlay = this._popups.get(popup);
      if (overlay !== undefined) {
        gsap.to(overlay, {
          duration: 0.25,
          alpha: 0,
          onComplete: () => {
            this._root.removeChild(overlay);
            overlay.destroy();
          },
        });
      }

      if (popup.parent === this._root) {
        gsap.to(popup, {
          alpha: 0,
          y: popup.y + 20,
          ease: "power2.out",
          duration: 0.25,
          onComplete: () => {
            gsap.killTweensOf(popup);
            this._root.removeChild(popup);
            if (destroy) {
              popup.destroy();
            }
            onComplete?.();
          },
        }).play();
      } else {
        gsap.killTweensOf(popup);
        popup.destroy();
        onComplete?.();
      }
      this._popups.delete(popup);
    }

    if (this._activePopup === popup) {
      this._activePopup = undefined;
      this.popFromStack();
    } else {
      const index = this._stack.indexOf(popup);
      if (index !== -1) {
        this._stack.splice(index, 1);
      }
    }
  }

  private onPopupRemoved(event: InteractionEvent) {
    const popup = event.target as DisplayObjectWithSize;
    this.hide(popup);
  }

  private pushInStack(popup: DisplayObjectWithSize) {
    this._stack.push(popup);
    this.pushPopup(popup);
  }

  private popFromStack() {
    if (this._stack.length > 0) {
      const popup = this._stack.pop();
      if (popup !== undefined) {
        this.popPopup(popup);
        this._activePopup = popup;
      }
    }
  }

  private pushPopup(popup: DisplayObjectWithSize) {
    if (this._popups.has(popup)) {
      popup.off("removed", this.onPopupRemoved, this);
      if (popup.parent === this._root) {
        const overlay = this._popups.get(popup);
        const targets = [popup];
        if (overlay !== undefined) {
          targets.push(overlay);
        }
        popup.emit(PopupEvent.FOCUS_OUT);
        gsap.to(targets, {
          alpha: 0,
          duration: 0.25,
          ease: "power2.in",
          onComplete: () => {
            for (const target of targets) {
              if (this._root === target.parent) {
                this._root.removeChild(target);
              }
            }
          },
        });
      }
    }
  }

  private popPopup(popup: DisplayObjectWithSize) {
    if (this._popups.has(popup)) {
      popup.emit(PopupEvent.FOCUS_IN);
      popup.on("removed", this.onPopupRemoved, this);
      const overlay = this._popups.get(popup);
      const targets = [popup];
      if (overlay !== undefined) {
        targets.push(overlay);
      }
      for (const target of targets.reverse()) {
        this._root.addChild(target);
      }
      gsap.to(targets, {
        alpha: 1,
        duration: 0.25,
        ease: "power2.inOut",
      });
    }
  }
}

interface IShowParams {
  isModal?: boolean;
  isCentered?: boolean;
  offsetX?: number;
  offsetY?: number;
  onComplete?: () => void;
}
