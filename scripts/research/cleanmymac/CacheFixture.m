// 仅执行目标扫描类；所有路径、大小和特权接口均限制为自有样本或测试替身。
#import <Foundation/Foundation.h>
@interface CMCacheScanTask : NSObject
- (id)initWithKnowledgeBase:(id)kb privilegedOperationsPerformer:(id)p cachesDirectoryURL:(NSURL *)url fileManager:(id)fm fileSizer:(id)sizer;
- (id)scan;
@end
@interface CMGradleCacheScanTask : CMCacheScanTask @end
@interface OwnedCacheTask : CMCacheScanTask @end
@implementation OwnedCacheTask
- (NSString *)identifier { return @"owned-fixture-cache"; }
@end
@interface OwnedGradleTask : CMGradleCacheScanTask @end
@implementation OwnedGradleTask
- (NSString *)identifier { return @"owned-fixture-gradle"; }
@end
@interface FixtureIO : NSObject
@property NSURL *root;
@property NSArray<NSURL *> *entries;
@property NSDictionary<NSString *,NSNumber *> *sizes;
@property NSSet<NSString *> *unreadable;
@property NSMutableArray<NSString *> *calls;
@property NSDictionary<NSString *,NSArray<NSURL *> *> *children;
@end
@implementation FixtureIO
- (void)check:(NSURL *)url {
 NSString *path=url.standardizedURL.path;
 NSCAssert([path isEqual:self.root.path]||[path hasPrefix:[self.root.path stringByAppendingString:@"/"]],@"拒绝样本范围外的读取");
 [self.calls addObject:path];
}
- (id)contentsOfDirectoryAt:(NSURL *)url with:(id)progress context:(id)context includingPropertiesForKeys:(id)keys options:(NSUInteger)options {
 [self check:url]; if([url.path isEqual:self.root.path])return self.entries;
 NSCAssert(self.children[url.lastPathComponent]!=nil,@"拒绝未知目录枚举");return self.children[url.lastPathComponent];
}
- (unsigned long long)byteSizeAtURL:(NSURL *)url cancellationFlag:(id)flag { [self check:url];return self.sizes[url.lastPathComponent].unsignedLongLongValue; }
- (BOOL)isReadableFileAtPath:(NSString *)path { [self check:[NSURL fileURLWithPath:path]];return ![self.unreadable containsObject:path.lastPathComponent]; }
@end
@interface FakePrivileges : NSObject
@property BOOL authorized;
@property NSUInteger sizeCalls;
@property NSURL *root;
@property unsigned long long fixtureSize;
@end
@implementation FakePrivileges
- (BOOL)isAuthorized { return self.authorized; }
- (unsigned long long)fileSizeAtURL:(NSURL *)url { NSCAssert([url.path hasPrefix:[self.root.path stringByAppendingString:@"/"]],@"拒绝范围外请求");self.sizeCalls++;return self.fixtureSize; }
@end
@interface FakeKnowledgeBase : NSObject
@property NSSet<NSString *> *ignored;
@property NSSet<NSString *> *deep;
@end
@implementation FakeKnowledgeBase
- (BOOL)isIgnoreItem:(NSString *)item { return [self.ignored containsObject:item]; }
- (BOOL)shouldPerformDeepSearchForItem:(NSString *)item { return [self.deep containsObject:item]; }
@end
int main(int argc, const char **argv) {
 @autoreleasepool { @try {
  NSCAssert(argc==2,@"需要自有输出目录");
  NSURL *base=[NSURL fileURLWithPath:@(argv[1]) isDirectory:YES];
  NSURL *root=[base URLByAppendingPathComponent:[@"fixture-" stringByAppendingString:NSUUID.UUID.UUIDString] isDirectory:YES];
  NSError *err=nil;NSCAssert([NSFileManager.defaultManager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:&err],@"创建自有样本失败");
  for(NSString *name in @[@"normal.cache",@"zero.cache",@".DS_Store",@"blocked.cache"]){
   NSCAssert([[@"fixture" dataUsingEncoding:NSUTF8StringEncoding] writeToURL:[root URLByAppendingPathComponent:name] options:NSDataWritingWithoutOverwriting error:&err],@"创建样本失败");
  }
  NSMutableArray *rows=NSMutableArray.new;
  NSURL *branch=[root URLByAppendingPathComponent:@"branch.cache" isDirectory:YES];
  NSCAssert([NSFileManager.defaultManager createDirectoryAtURL:branch withIntermediateDirectories:NO attributes:nil error:&err],@"创建子样本失败");
  for(NSString *name in @[@"child.cache",@"zero-child.cache",@".DS_Store"]){NSCAssert([[@"fixture" dataUsingEncoding:NSUTF8StringEncoding]writeToURL:[branch URLByAppendingPathComponent:name]options:NSDataWritingWithoutOverwriting error:&err],@"创建子样本失败");}
  NSArray *cases=@[
   @{@"name":@"base",@"expectedSize":@100,@"expectedNames":@[@"normal.cache"]},
   @{@"name":@"gradle",@"gradle":@YES,@"expectedSize":@100,@"expectedNames":@[@"normal.cache"]},
   @{@"name":@"authorized-fallback",@"authorized":@YES,@"fallback":@37,@"expectedSize":@137,@"expectedNames":@[@"normal.cache",@"zero.cache",@"blocked.cache"]},
   @{@"name":@"authorized-zero",@"authorized":@YES,@"expectedSize":@100,@"expectedNames":@[@"normal.cache",@"zero.cache",@"blocked.cache"]},
   @{@"name":@"ignore-by-name",@"ignored":@[@"normal.cache"],@"expectedSize":@0,@"expectedNames":@[]},
   @{@"name":@"ignore-by-path",@"ignored":@[[root URLByAppendingPathComponent:@"normal.cache"].path],@"expectedSize":@0,@"expectedNames":@[]},
   @{@"name":@"deep-search",@"deep":@YES,@"expectedSize":@37,@"expectedNames":@[@"branch.cache"]},
   @{@"name":@"deep-ignored-child",@"deep":@YES,@"ignored":@[@"child.cache"],@"expectedSize":@0,@"expectedNames":@[@"branch.cache"]}
  ];
  for(NSDictionary *c in cases){
   FixtureIO *io=FixtureIO.new;io.root=root;io.calls=NSMutableArray.new;io.entries=@[[root URLByAppendingPathComponent:@"normal.cache"],[root URLByAppendingPathComponent:@"zero.cache"],[root URLByAppendingPathComponent:@".DS_Store"],[root URLByAppendingPathComponent:@"blocked.cache"]];io.sizes=@{@"normal.cache":@100,@"zero.cache":@0,@".DS_Store":@8,@"blocked.cache":@0};io.unreadable=[NSSet setWithObject:@"blocked.cache"];
   FakePrivileges *priv=FakePrivileges.new;priv.root=root;priv.authorized=[c[@"authorized"]boolValue];priv.fixtureSize=[c[@"fallback"]unsignedLongLongValue];
   id kb=nil;
   if(c[@"ignored"]||c[@"deep"]){FakeKnowledgeBase *fake=FakeKnowledgeBase.new;fake.ignored=[NSSet setWithArray:c[@"ignored"]?:@[]];fake.deep=[NSSet setWithArray:[c[@"deep"]boolValue]?@[@"branch.cache"]:@[]];kb=fake;}
   if([c[@"deep"]boolValue]){io.entries=@[branch];io.children=@{@"branch.cache":@[[branch URLByAppendingPathComponent:@"child.cache"],[branch URLByAppendingPathComponent:@"zero-child.cache"],[branch URLByAppendingPathComponent:@".DS_Store"]]};io.sizes=@{@"child.cache":@37,@"zero-child.cache":@0,@".DS_Store":@8};}
   Class cls=[c[@"gradle"]boolValue]?OwnedGradleTask.class:OwnedCacheTask.class;
   id task=[[cls alloc]initWithKnowledgeBase:kb privilegedOperationsPerformer:priv cachesDirectoryURL:root fileManager:io fileSizer:io];
   id result=[task scan];NSArray *items=[result valueForKey:@"items"];NSMutableArray *names=NSMutableArray.new;
   NSMutableArray *childNames=NSMutableArray.new;
   for(id model in items){NSURL *url=[model valueForKey:[model respondsToSelector:NSSelectorFromString(@"fileURL")]?@"fileURL":@"value"];[names addObject:url.lastPathComponent];
    if([model respondsToSelector:NSSelectorFromString(@"children")])for(id child in [model valueForKey:@"children"]){NSURL *childURL=[child valueForKey:@"fileURL"];[childNames addObject:childURL.lastPathComponent];}
   }
   NSNumber *size=[result valueForKey:@"size"];NSNumber *selected=[result valueForKey:@"selectedSize"];
   BOOL authorized=priv.authorized;
   NSCAssert([[NSSet setWithArray:names]isEqualToSet:[NSSet setWithArray:c[@"expectedNames"]]],@"结果项与样本预期不符：%@ %@",c[@"name"],names);
   NSCAssert(size.unsignedLongLongValue==[c[@"expectedSize"]unsignedLongLongValue],@"聚合大小不符");
   NSCAssert(selected.unsignedLongLongValue==([c[@"gradle"]boolValue]?0:size.unsignedLongLongValue),@"自动选择差异不符");
   if([c[@"deep"]boolValue]){
    NSCAssert([childNames containsObject:@"zero-child.cache"],@"深入分支应保留未被忽略的零大小子项");
    NSCAssert(![childNames containsObject:@".DS_Store"],@"子项 DS_Store 应被忽略");
    NSCAssert([childNames containsObject:@"child.cache"]==![c[@"ignored"]containsObject:@"child.cache"],@"子项忽略不符");
   }
   NSCAssert(priv.sizeCalls==(authorized?1:0),@"仅授权且不可读时调用大小替身");
   [rows addObject:@{@"case":c[@"name"],@"items":names,@"children":childNames,@"size":size,@"selectedSize":selected,@"privilegedSizeCalls":@(priv.sizeCalls),@"fixtureReadCalls":@(io.calls.count)}];
  }
  NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"targetClassExecution":@YES,@"knowledgeBase":@"nil 或确定性测试替身；未验证实际知识库规则内容",@"fileIO":@"仅样本范围的受限替身；未验证真实大小算法",@"privileges":@"测试替身，无 IPC 或提权",@"fixtureRoot":root.path,@"cases":rows} options:NSJSONWritingPrettyPrinted error:&err];
  puts([[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding].UTF8String);return 0;
 } @catch(NSException *e){fprintf(stderr,"样本验证失败：%s %s\n",e.name.UTF8String,e.reason.UTF8String);return 1;} }
}
