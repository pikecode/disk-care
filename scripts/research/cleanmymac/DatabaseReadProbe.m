// 独立进程：仅自有数据库允许写入，安装包数据库先复制再以只读方式检查。
#import <Foundation/Foundation.h>
#import <sqlite3.h>
@interface FMResultSet : NSObject
- (BOOL)next;
- (int)intForColumn:(NSString *)column;
- (NSString *)stringForColumn:(NSString *)column;
- (void)close;
@end
@interface FMDatabase : NSObject
+ (instancetype)databaseWithPath:(NSString *)path;
- (BOOL)open;
- (BOOL)openWithFlags:(int)flags;
- (BOOL)setKeyWithData:(NSData *)key;
- (BOOL)executeStatements:(NSString *)sql;
- (FMResultSet *)executeQuery:(NSString *)sql values:(NSArray *)values error:(NSError **)error;
- (BOOL)close;
@end
int main(int argc,const char **argv){@autoreleasepool{@try{
 NSCAssert(argc==2,@"需要自有输出目录");
 NSString *dir=[@(argv[1]) stringByAppendingPathComponent:[@"db-probe-" stringByAppendingString:NSUUID.UUID.UUIDString]];
 NSError *error=nil;NSCAssert([NSFileManager.defaultManager createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:&error],@"创建样本目录失败");
 FMDatabase *control=[FMDatabase databaseWithPath:@":memory:"];NSCAssert([control open],@"内存库打开失败");
 NSCAssert([control executeStatements:@"PRAGMA cipher_default_compatibility = 3"],@"兼容配置失败");
 FMResultSet *version=[control executeQuery:@"PRAGMA cipher_version" values:@[] error:&error];NSCAssert([version next],@"未读取到 cipher_version");NSString *cipher=[version stringForColumn:@"cipher_version"]?:@"unknown";[version close];[control close];
 NSString *owned=[dir stringByAppendingPathComponent:@"owned.db"];NSData *key=[@"owned-fixture-only" dataUsingEncoding:NSUTF8StringEncoding];
 FMDatabase *writer=[FMDatabase databaseWithPath:owned];NSCAssert([writer open],@"自有库打开失败");NSCAssert([writer setKeyWithData:key],@"自有库密钥失败");NSCAssert([writer executeStatements:@"CREATE TABLE ScanItems(Value TEXT,IsRegex TEXT,GroupType INTEGER,ScannerID INTEGER); INSERT INTO ScanItems VALUES('fixture','false',1,1);"],@"自有库初始化失败");[writer close];
 NSMutableArray *rows=NSMutableArray.new;
 FMDatabase *reader=[FMDatabase databaseWithPath:owned];NSCAssert([reader openWithFlags:SQLITE_OPEN_READONLY],@"只读打开失败");NSCAssert([reader setKeyWithData:key],@"只读密钥失败");
 FMResultSet *rs=[reader executeQuery:@"SELECT count(*) AS n FROM ScanItems" values:@[] error:&error];NSCAssert(rs&&[rs next]&&[rs intForColumn:@"n"]==1,@"只读正向检查失败");[rs close];
 BOOL refused=![reader executeStatements:@"UPDATE ScanItems SET Value='unexpected'"];NSCAssert(refused,@"只读状态允许了写入");[reader close];
 [rows addObject:@{@"case":@"owned-correct-key-readonly",@"readable":@YES,@"writeRefused":@(refused)}];
 reader=[FMDatabase databaseWithPath:owned];NSCAssert([reader openWithFlags:SQLITE_OPEN_READONLY],@"错误密钥检查打开失败");[reader setKeyWithData:[@"wrong-fixture-key" dataUsingEncoding:NSUTF8StringEncoding]];error=nil;rs=[reader executeQuery:@"SELECT name FROM sqlite_master" values:@[] error:&error];NSCAssert(rs==nil,@"错误密钥未被拒绝");[rows addObject:@{@"case":@"owned-wrong-key",@"readable":@NO,@"errorCode":@(error.code)}];[reader close];
 for(NSString *name in @[@"info.cmmkb",@"userInfo.cmmkb"]){
  NSString *source=[@"/Applications/CleanMyMac_5.app/Contents/Resources" stringByAppendingPathComponent:name];NSString *copy=[dir stringByAppendingPathComponent:name];NSCAssert([NSFileManager.defaultManager copyItemAtPath:source toPath:copy error:&error],@"复制包内资源失败");
  reader=[FMDatabase databaseWithPath:copy];NSCAssert([reader openWithFlags:SQLITE_OPEN_READONLY],@"资源副本只读打开失败");error=nil;rs=[reader executeQuery:@"SELECT name FROM sqlite_master" values:@[] error:&error];
  BOOL readable=rs!=nil;[rows addObject:@{@"case":name,@"readableWithoutKey":@(readable),@"errorCode":@(error.code)}];if(rs)[rs close];[reader close];
 }
 NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"cipherVersion":cipher,@"probeDirectory":dir,@"cases":rows} options:NSJSONWritingPrettyPrinted error:&error];puts([[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding].UTF8String);return 0;
}@catch(NSException *e){fprintf(stderr,"数据库验证失败：%s\n",e.reason.UTF8String);return 1;}}}
