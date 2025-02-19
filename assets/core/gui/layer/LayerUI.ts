/*
 * UI基础层，允许添加多个预制件节点
 * add          : 添加一个预制件节点到层容器中，该方法将返回一个唯一uuid来标识该操作Node节点。
 * delete       : 根据uuid删除Node节点，如果节点还在队列中也会被删除, 删除节点可以用gui.delete(node)或this.node.destroy()
 * deleteByUuid : 根据预制件路径删除，预制件如在队列中也会被删除，如果该预制件存在多个也会一起删除。
 * get          : 根据uuid获取Node节点，如果节点不存在或者预制件还在队列中，则返回null 。
 * getByUuid    : 根据预制件路径获取当前显示的该预制件的所有Node节点数组。
 * has          : 判断当前层是否包含 uuid或预制件路径对应的Node节点。
 * find         : 判断当前层是否包含 uuid或预制件路径对应的Node节点。
 * size         : 当前层上显示的所有Node节点数。
 * clear        : 清除所有Node节点，队列当中未创建的任务也会被清除。
 */
import { error, instantiate, isValid, Node, Prefab, warn, Widget } from "cc";
import { oops } from "../../Oops";
import { UICallbacks, ViewParams } from "./Defines";
import { DelegateComponent } from "./DelegateComponent";
import { UIConfig } from "./LayerManager";

/** 界面层对象 */
export class LayerUI extends Node {
    /** 界面节点集合 */
    protected ui_nodes = new Map<string, ViewParams>();
    /** 被移除的界面缓存数据 */
    protected ui_cache = new Map<string, ViewParams>();

    /**
     * UI基础层，允许添加多个预制件节点
     * @param name 该层名
     * @param container 容器Node
     */
    constructor(name: string) {
        super(name);

        var widget: Widget = this.addComponent(Widget);
        widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
        widget.left = widget.right = widget.top = widget.bottom = 0;
        widget.alignMode = 2;
        widget.enabled = true;
    }

    /** 构造一个唯一标识UUID */
    protected getUuid(prefabPath: string): string {
        var uuid = `${this.name}_${prefabPath}`;
        return uuid.replace(/\//g, "_");
    }

    /**
     * 添加一个预制件节点到层容器中，该方法将返回一个唯一`uuid`来标识该操作节点
     * @param prefabPath 预制件路径
     * @param params     自定义参数
     * @param callbacks  回调函数对象，可选
     */
    add(config: UIConfig, params?: any, callbacks?: UICallbacks): string {
        let prefabPath = config.prefab;
        var uuid = this.getUuid(prefabPath);
        var viewParams = this.ui_nodes.get(uuid);

        if (viewParams && viewParams.valid) {
            warn(`路径为【${prefabPath}】的预制重复加载`);
            return "";
        }

        if (viewParams == null) {
            viewParams = new ViewParams();
            viewParams.uuid = uuid;
            viewParams.prefabPath = prefabPath;
            this.ui_nodes.set(viewParams.uuid, viewParams);
        }

        viewParams.params = params ?? {};
        viewParams.callbacks = callbacks ?? {};
        viewParams.valid = true;

        this.load(viewParams, config.bundle)

        return uuid;
    }

    /**
     * 加载界面资源
     * @param viewParams 显示参数
     * @param bundle     远程资源包名，如果为空就是默认本地资源包
     */
    protected load(viewParams: ViewParams, bundle?: string) {
        var vp: ViewParams = this.ui_nodes.get(viewParams.uuid)!;
        if (vp && vp.node) {
            this.createNode(vp);
        }
        else {
            // 优先加载配置的指定资源包中资源，如果没配置则加载默认资源包资源
            bundle = bundle || oops.res.defaultBundleName;
            oops.res.load(bundle, viewParams.prefabPath, (err: Error | null, res: Prefab) => {
                if (err) {
                    error(err);
                }

                let childNode: Node = instantiate(res);
                viewParams.node = childNode;

                let comp: DelegateComponent = childNode.addComponent(DelegateComponent);
                comp.viewParams = viewParams;

                this.createNode(viewParams);
            });
        }
    }

    /**
     * 创建界面节点
     * @param viewParams  视图参数
     */
    protected createNode(viewParams: ViewParams) {
        viewParams.valid = true;

        let comp: DelegateComponent = viewParams.node.getComponent(DelegateComponent)!;
        comp.add();
        viewParams.node.parent = this;

        return viewParams.node;
    }

    /**
     * 根据预制件路径删除，预制件如在队列中也会被删除，如果该预制件存在多个也会一起删除
     * @param prefabPath   预制路径
     * @param isDestroy    移除后是否释放
     */
    remove(prefabPath: string, isDestroy: boolean): void {
        // 验证是否删除后台缓存界面
        if (isDestroy) this.removeCache(prefabPath);

        // 界面移出舞台
        let children = this.__nodes();
        for (let i = 0; i < children.length; i++) {
            let viewParams = children[i].viewParams;
            if (viewParams.prefabPath === prefabPath) {
                if (isDestroy) {
                    // 直接释放界面
                    this.ui_nodes.delete(viewParams.uuid);
                }
                else {
                    // 不释放界面，缓存起来待下次使用
                    this.ui_cache.set(viewParams.prefabPath, viewParams);
                }

                children[i].remove(isDestroy);
                viewParams.valid = false;
            }
        }
    }

    /**
     * 根据唯一标识删除节点，如果节点还在队列中也会被删除
     * @param uuid  唯一标识
     */
    protected removeByUuid(uuid: string, isDestroy: boolean): void {
        var viewParams = this.ui_nodes.get(uuid);
        if (viewParams) {
            if (isDestroy)
                this.ui_nodes.delete(viewParams.uuid);

            var childNode = viewParams.node;
            var comp = childNode.getComponent(DelegateComponent)!;
            comp.remove(isDestroy);
        }
    }

    /** 
     * 删除缓存的界面，当缓存界面被移除舞台时，可通过此方法删除缓存界面
     */
    private removeCache(prefabPath: string) {
        let viewParams = this.ui_cache.get(prefabPath);
        if (viewParams) {
            var childNode = viewParams.node;
            var comp = childNode.getComponent(DelegateComponent)!
            comp.remove(true);
            this.ui_nodes.delete(viewParams.uuid);
            this.ui_cache.delete(prefabPath);
        }
    }

    /**
     * 根据唯一标识获取节点，如果节点不存在或者还在队列中，则返回null 
     * @param uuid  唯一标识
     */
    getByUuid(uuid: string): Node {
        let children = this.__nodes();
        for (let comp of children) {
            if (comp.viewParams && comp.viewParams.uuid === uuid) {
                return comp.node;
            }
        }
        return null!;
    }

    /**
     * 根据预制件路径获取当前显示的该预制件的所有Node节点数组
     * @param prefabPath 
     */
    get(prefabPath: string): Array<Node> {
        let arr: Array<Node> = [];
        let children = this.__nodes();
        for (let comp of children) {
            if (comp.viewParams.prefabPath === prefabPath) {
                arr.push(comp.node);
            }
        }
        return arr;
    }

    /**
     * 判断当前层是否包含 uuid或预制件路径对应的Node节点
     * @param prefabPathOrUUID 预制件路径或者UUID
     */
    has(prefabPathOrUUID: string): boolean {
        let children = this.__nodes();
        for (let comp of children) {
            if (comp.viewParams.uuid === prefabPathOrUUID || comp.viewParams.prefabPath === prefabPathOrUUID) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取当前层包含指定正则匹配的Node节点。
     * @param prefabPathReg 匹配预制件路径的正则表达式对象
     */
    find(prefabPathReg: RegExp): Node[] {
        let arr: Node[] = [];
        let children = this.__nodes();
        for (let comp of children) {
            if (prefabPathReg.test(comp.viewParams.prefabPath)) {
                arr.push(comp.node);
            }
        }
        return arr;
    }

    /** 获取当前层所有窗口事件触发组件 */
    protected __nodes(): Array<DelegateComponent> {
        let result: Array<DelegateComponent> = [];
        let children = this.children;
        for (let i = 0; i < children.length; i++) {
            let comp = children[i].getComponent(DelegateComponent);
            if (comp && comp.viewParams && comp.viewParams.valid && isValid(comp)) {
                result.push(comp);
            }
        }
        return result;
    }

    /** 层节点数量 */
    size(): number {
        return this.children.length;
    }

    /**
     * 清除所有节点，队列当中的也删除
     * @param isDestroy  移除后是否释放
     */
    clear(isDestroy: boolean): void {
        // 清除所有显示的界面
        this.ui_nodes.forEach((value: ViewParams, key: string) => {
            this.removeByUuid(value.uuid, isDestroy);
            value.valid = false;
        });
        this.ui_nodes.clear();

        // 清除缓存中的界面
        if (isDestroy) {
            this.ui_cache.forEach((value: ViewParams, prefabPath: string) => {
                this.removeCache(prefabPath);
            });
        }
    }
}