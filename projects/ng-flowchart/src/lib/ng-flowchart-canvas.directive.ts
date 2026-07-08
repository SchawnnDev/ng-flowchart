import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewContainerRef,
} from '@angular/core';
import { debounceTime, fromEvent, Subscription } from 'rxjs';
import { NgFlowchart } from './model/flow.model';
import { CONSTANTS } from './model/flowchart.constants';
import { NgFlowchartCanvasService } from './ng-flowchart-canvas.service';
import { CanvasRendererService } from './services/canvas-renderer.service';
import { OptionsService } from './services/options.service';
import { StepManagerService } from './services/step-manager.service';

@Directive({
    selector: '[ngFlowchartCanvas]',
    providers: [
        NgFlowchartCanvasService,
        StepManagerService,
        OptionsService,
        CanvasRendererService,
    ],
    standalone: false
})
export class NgFlowchartCanvasDirective
  implements OnInit, OnDestroy, AfterViewInit
{
  @HostListener('drop', ['$event'])
  protected onDrop(event: DragEvent) {
    if (this._disabled) {
      return;
    }
    // its possible multiple canvases exist so make sure we only move/drop on the closest one
    const closestCanvasToTarget = (event.target as HTMLElement).closest(`.${CONSTANTS.CANVAS_CLASS}`);
    if (closestCanvasToTarget !== this.canvasEle.nativeElement) {
      return;
    }

    const type = event.dataTransfer.getData('type');
    if (type === NgFlowchart.DropType.Step) {
      const source = event.dataTransfer.getData('source');
      if (NgFlowchart.DropSource.Canvas == source) {
        this.canvas.moveStep(event, event.dataTransfer.getData('id'));
      } else if (NgFlowchart.DropSource.Palette == source) {
        this.canvas.onDrop(event);
      }
    }
  }

  @HostListener('dragover', ['$event'])
  protected onDragOver(event: DragEvent) {
    event.preventDefault();
    if (this._disabled) {
      return;
    }
    this.canvas.onDragStart(event);
  }

  _options: NgFlowchart.Options;
  _callbacks: NgFlowchart.Callbacks;

  @HostListener('wheel', ['$event'])
  protected onZoom(event: WheelEvent) {
    if (this._options.zoom.mode !== 'WHEEL') {
      return;
    }
    // Wheel / trackpad pinch always zoom, centered on the cursor (React-Flow style).
    event.preventDefault();
    this.zoomAtCursor(event);
  }

  private panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  @HostListener('mousedown', ['$event'])
  protected canvasDragScroll(e: MouseEvent) {
    const validDragAnchor =
      e.target === this.canvasContent ||
      e.target === this.canvasEle.nativeElement;
    const validLeftClick =
      this.options.dragScroll.includes('LEFT') &&
      validDragAnchor &&
      e.button === 0;
    const validOther =
      (this.options.dragScroll.includes('MIDDLE') && e.button === 1) ||
      (this.options.dragScroll.includes('RIGHT') && e.button === 2);

    if (validLeftClick || validOther) {
      e.preventDefault();
      e.stopPropagation();
      const pan = this.canvas.getPan();
      this.panStart = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      this.canvasEle.nativeElement.classList.add('grabbing');

      document.addEventListener('mousemove', this.mouseMoveHandler);
      document.addEventListener('mouseup', this.mouseUpHandler);
    }
  }

  @HostListener('contextmenu', ['$event'])
  protected onContextMenu(e: MouseEvent) {
    if (this.options.dragScroll.includes('RIGHT')) {
      e.preventDefault();
    }
  }

  @Input()
  set ngFlowchartCallbacks(callbacks: NgFlowchart.Callbacks) {
    this.optionService.setCallbacks(callbacks);
  }

  @Input()
  set ngFlowchartOptions(options: NgFlowchart.Options) {
    this.optionService.setOptions(options);
    this._options = this.optionService.options;
    this.canvas.reRender();
  }

  get options() {
    return this._options;
  }

  @Input()
  @HostBinding('attr.disabled')
  set disabled(val: boolean) {
    this._disabled = val !== false;
    if (this.canvas) {
      this.canvas._disabled = this._disabled;
    }
  }

  get disabled() {
    return this._disabled;
  }

  private _disabled: boolean = false;
  private _id: string = null;
  private canvasContent: HTMLElement;
  private windowResizeSubscription: Subscription;

  constructor(
    protected canvasEle: ElementRef<HTMLElement>,
    private viewContainer: ViewContainerRef,
    private canvas: NgFlowchartCanvasService,
    private optionService: OptionsService
  ) {
    this.canvasEle.nativeElement.classList.add(CONSTANTS.CANVAS_CLASS);
    this.canvasContent = this.createCanvasContent(this.viewContainer);
    this._id = this.canvasContent.id;
    this.mouseMoveHandler = this.mouseMoveHandler.bind(this);
    this.mouseUpHandler = this.mouseUpHandler.bind(this);
  }

  ngOnInit() {
    this.canvas.init(this.viewContainer);
    if (!this._options) {
      this.ngFlowchartOptions = new NgFlowchart.Options();
    }

    this.canvas._disabled = this._disabled;

    this.handleWindowResize();
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    for (let i = 0; i < this.viewContainer.length; i++) {
      this.viewContainer.remove(i);
    }
    this.canvasEle.nativeElement.remove();
    this.viewContainer.element.nativeElement.remove();
    this.viewContainer = undefined;

    this.windowResizeSubscription.unsubscribe();
  }

  private handleWindowResize(): void {
    this.windowResizeSubscription = fromEvent(window, 'resize')
      .pipe(debounceTime(100))
      .subscribe(() => {
        if (this._options.centerOnResize) {
          this.canvas.reRender(true);
        }
      });
  }

  private createCanvasContent(viewContainer: ViewContainerRef): HTMLElement {
    const canvasId = 'c' + Date.now();

    let canvasEle = viewContainer.element.nativeElement as HTMLElement;
    let canvasContent = document.createElement('div');
    canvasContent.id = canvasId;
    canvasContent.classList.add(CONSTANTS.CANVAS_CONTENT_CLASS);
    canvasEle.appendChild(canvasContent);
    return canvasContent;
  }

  /**
   * Returns the Flow object representing this flow chart.
   */
  public getFlow() {
    return new NgFlowchart.Flow(this.canvas);
  }

  public scaleDown() {
    this.canvas.scaleDown();
  }

  public scaleUp() {
    this.canvas.scaleUp();
  }

  public setScale(scaleValue: number) {
    const scaleVal = Math.max(0, scaleValue);
    this.canvas.setScale(scaleVal);
  }

  public setNestedScale(scaleValue: number) {
    const scaleVal = Math.max(0, scaleValue);
    this.canvas.setNestedScale(scaleVal);
  }

  private zoomAtCursor(event: WheelEvent) {
    if (!this.canvas.flow.hasRoot()) {
      return;
    }
    const rect = this.canvasEle.nativeElement.getBoundingClientRect();
    const pivotX = event.clientX - rect.left;
    const pivotY = event.clientY - rect.top;

    const step = this._options.zoom.defaultStep || 0.1;
    const factor = event.deltaY < 0 ? 1 + step : 1 - step;
    const newScale = this.canvas.getScale() * factor;

    this.canvas.zoomToPoint(newScale, pivotX, pivotY);
  }

  /** Reset the viewport pan/zoom to its default position. */
  public resetView() {
    this.canvas.resetView();
  }

  private mouseMoveHandler(e: MouseEvent) {
    // How far the mouse has been moved since the pan started
    const dx = e.clientX - this.panStart.x;
    const dy = e.clientY - this.panStart.y;

    // Translate the viewport (infinite canvas) instead of scrolling
    this.canvas.setPan(this.panStart.panX + dx, this.panStart.panY + dy);
  }

  private mouseUpHandler(e: MouseEvent) {
    this.canvasEle.nativeElement.classList.remove('grabbing');
    document.removeEventListener('mousemove', this.mouseMoveHandler);
    document.removeEventListener('mouseup', this.mouseUpHandler);
  }

  public setOrientation(orientation: NgFlowchart.Orientation) {
    var options = {
      ...this.options,
      orientation: orientation,
    };
    this.optionService.setOptions(options);
    this._options = this.optionService.options;

    //set orientation class for all steps
    this.canvas.flow.steps.forEach(step => {
      if (this.options.orientation === 'HORIZONTAL') {
        step.nativeElement.classList.add('horizontal');
      } else {
        step.nativeElement.classList.remove('horizontal');
      }
    });
    this.canvas.reRender(true);
  }
}
