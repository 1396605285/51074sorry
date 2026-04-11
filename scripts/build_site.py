#!/usr/bin/env python3
import os
import csv
import json
import ast
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import shutil


BEIJING_TZ = timezone(timedelta(hours=8))


def timestamp_to_year(timestamp) -> str:
    if timestamp is None:
        return 'unknown'
    try:
        ts = int(timestamp)
        if ts <= 0:
            return 'unknown'
        dt = datetime.fromtimestamp(ts, BEIJING_TZ)
        return dt.strftime('%Y')
    except (ValueError, OSError, TypeError):
        return 'unknown'


def timestamp_to_year_month(timestamp) -> str:
    if timestamp is None:
        return 'unknown'
    try:
        ts = int(timestamp)
        if ts <= 0:
            return 'unknown'
        dt = datetime.fromtimestamp(ts, BEIJING_TZ)
        return dt.strftime('%Y-%m')
    except (ValueError, OSError, TypeError):
        return 'unknown'


class SiteBuilder:
    def __init__(self, data_dir: str = 'data', output_dir: str = 'docs', upload_dir: str = 'upload'):
        self.data_dir = data_dir
        self.output_dir = output_dir
        self.upload_dir = upload_dir
        self.assets_dir = os.path.join(output_dir, 'assets')
        self.data_output_dir = os.path.join(output_dir, 'data')
        self.current_sec_uid = None
        self.current_user_dir = None
        
    def build(self):
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.data_output_dir, exist_ok=True)
        
        existing_users = self._load_existing_users_index()
        all_users_data = []
        
        for user_dir in os.listdir(self.data_dir):
            user_path = os.path.join(self.data_dir, user_dir)
            if not os.path.isdir(user_path):
                continue
            
            videos_csv = os.path.join(user_path, 'videos.csv')
            if not os.path.exists(videos_csv):
                continue
            
            print(f"处理用户: {user_dir}")
            self.current_sec_uid = user_dir
            self.current_user_dir = os.path.join(self.data_output_dir, user_dir)
            self.current_comments_dir = os.path.join(self.current_user_dir, 'comments')
            os.makedirs(self.current_user_dir, exist_ok=True)
            os.makedirs(self.current_comments_dir, exist_ok=True)
            
            videos = self._load_videos(videos_csv)
            comments_data = self._load_all_comments(user_path)
            
            active_repliers = self._calculate_active_repliers(comments_data)
            author_replies = self._count_author_replies(comments_data)
            participants_count = self._count_participants(user_dir)
            
            video_list = []
            total_reply_count = 0
            
            for video in videos:
                aweme_id = video['aweme_id']
                comments = comments_data.get(aweme_id, [])
                video['comment_count'] = len(comments)
                
                reply_count = 0
                for comment in comments:
                    reply_count += len(comment.get('replies', []))
                video['reply_count'] = reply_count
                total_reply_count += reply_count
                
                year_month = timestamp_to_year(video.get('create_time'))
                video['images'] = self._parse_images_to_path(video.get('images', ''), 'images', year_month)
                video['thumb'] = self._parse_images_to_path(video.get('thumb', ''), 'thumbs', year_month)
                
                video_info = {
                    'aweme_id': aweme_id,
                    'desc': video.get('desc', ''),
                    'create_time': video.get('create_time'),
                    'create_time_str': video.get('create_time_str', ''),
                    'images': video['images'],
                    'thumb': video['thumb'],
                    'comment_count': video['comment_count']
                }
                video_list.append(video_info)
                
                self._save_comments_file(aweme_id, video.get('desc', ''), comments)
            
            video_list.sort(key=lambda x: x.get('create_time', 0) or 0, reverse=True)
            
            video_list_data = {
                'sec_uid': user_dir,
                'base_url': f'upload/{user_dir}/',
                'videos': video_list,
                'total_videos': len(video_list),
                'total_comments': sum(v['comment_count'] for v in video_list) + total_reply_count
            }
            
            user_video_list_file = os.path.join(self.current_user_dir, 'video_list.json')
            with open(user_video_list_file, 'w', encoding='utf-8') as f:
                json.dump(video_list_data, f, ensure_ascii=False, indent=2)
            print(f"用户视频列表已保存到: {user_video_list_file}")
            
            self._generate_user_summary(video_list_data, active_repliers)
            
            self._copy_avatar(user_path)
            
            existing_user = existing_users.get(user_dir, {})
            
            latest_video = self._get_latest_video_info(video_list)
            
            user_data = {
                'sec_uid': user_dir,
                'nickname': existing_user.get('nickname', ''),
                'total_videos': video_list_data['total_videos'],
                'total_comments': video_list_data['total_comments'],
                'author_replies': author_replies,
                'participants_count': participants_count,
                'latest_video': latest_video
            }
            all_users_data.append(user_data)
        
        users_index_file = os.path.join(self.data_output_dir, 'users_index.json')
        with open(users_index_file, 'w', encoding='utf-8') as f:
            json.dump({
                'users': all_users_data
            }, f, ensure_ascii=False, indent=2)
        print(f"用户索引已保存到: {users_index_file}")
        
        print("网站数据构建完成!")
    
    def _load_existing_users_index(self) -> Dict:
        users_index_file = os.path.join(self.data_output_dir, 'users_index.json')
        if os.path.exists(users_index_file):
            try:
                with open(users_index_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return {u['sec_uid']: u for u in data.get('users', [])}
            except Exception as e:
                print(f"读取现有用户索引失败: {e}")
        return {}
    
    def _copy_avatar(self, user_path: str):
        src_avatar = os.path.join(user_path, 'avatar.jpeg')
        if os.path.exists(src_avatar):
            dst_avatar = os.path.join(self.current_user_dir, 'avatar.jpeg')
            shutil.copy2(src_avatar, dst_avatar)
            print(f"用户头像已复制到: {dst_avatar}")
    
    def _save_comments_file(self, aweme_id: str, video_title: str, comments: List[Dict]):
        comments_data = {
            'aweme_id': aweme_id,
            'video_title': video_title,
            'comments': comments
        }
        
        output_file = os.path.join(self.current_comments_dir, f'{aweme_id}.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(comments_data, f, ensure_ascii=False, indent=2)
    
    def _load_videos(self, csv_path: str) -> List[Dict]:
        videos = []
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                video = dict(row)
                if video.get('create_time'):
                    try:
                        ts = int(video['create_time'])
                        video['create_time_str'] = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
                    except (ValueError, TypeError):
                        video['create_time_str'] = ''
                videos.append(video)
        return videos
    
    def _load_all_comments(self, user_path: str) -> Dict[str, List[Dict]]:
        comments_data = {}
        
        for entry in os.listdir(user_path):
            year_month_path = os.path.join(user_path, entry)
            if not os.path.isdir(year_month_path) or '-' not in entry:
                continue
            
            for aweme_id in os.listdir(year_month_path):
                aweme_path = os.path.join(year_month_path, aweme_id)
                if not os.path.isdir(aweme_path):
                    continue
                
                comments_csv = os.path.join(aweme_path, 'comments.csv')
                replies_csv = os.path.join(aweme_path, 'replies.csv')
                
                if os.path.exists(comments_csv):
                    comments = self._load_comments(comments_csv)
                    
                    if os.path.exists(replies_csv):
                        replies = self._load_replies(replies_csv)
                        for comment in comments:
                            cid = comment['cid']
                            comment['replies'] = [r for r in replies if r.get('reply_id') == cid]
                            comment['reply_count'] = len(comment['replies'])
                    
                    comments_data[aweme_id] = comments
        
        return comments_data
    
    def _load_comments(self, csv_path: str) -> List[Dict]:
        comments = []
        year_month = self._extract_year_month_from_path(csv_path)
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                comment = dict(row)
                if comment.get('create_time'):
                    try:
                        ts = int(comment['create_time'])
                        comment['create_time_str'] = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
                        if comment.get('user_avatar') and not comment['user_avatar'].startswith('http'):
                            comment['user_avatar'] = f"avatars/{year_month}/{comment['user_avatar']}"
                    except (ValueError, TypeError):
                        comment['create_time_str'] = ''
                comments.append(comment)
        return comments
    
    def _load_replies(self, csv_path: str) -> List[Dict]:
        replies = []
        year_month = self._extract_year_month_from_path(csv_path)
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                reply = dict(row)
                if reply.get('create_time'):
                    try:
                        ts = int(reply['create_time'])
                        reply['create_time_str'] = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
                        if reply.get('user_avatar') and not reply['user_avatar'].startswith('http'):
                            reply['user_avatar'] = f"avatars/{year_month}/{reply['user_avatar']}"
                    except (ValueError, TypeError):
                        reply['create_time_str'] = ''
                replies.append(reply)
        return replies
    
    def _extract_year_month_from_path(self, path: str) -> str:
        parts = path.replace('\\', '/').split('/')
        for part in parts:
            if '-' in part and len(part) == 7 and part[:4].isdigit():
                return part[:4]
        return 'unknown'
    
    def _parse_images_to_path(self, images_str: str, folder: str, year_month: str) -> List[str]:
        if not images_str:
            return []
        
        filenames = []
        try:
            if images_str.startswith('['):
                parsed = ast.literal_eval(images_str)
                if isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, list):
                            filenames.extend(item)
                        elif isinstance(item, str):
                            filenames.append(item)
                else:
                    filenames = parsed
        except (ValueError, SyntaxError):
            return []
        
        paths = []
        for filename in filenames:
            if filename:
                if filename.startswith('http://') or filename.startswith('https://'):
                    paths.append(filename)
                else:
                    path = f"{folder}/{year_month}/{filename}"
                    paths.append(path)
        
        return paths
    
    def _calculate_active_repliers(self, comments_data: Dict[str, List[Dict]]) -> List[Dict]:
        replier_count = {}
        
        for aweme_id, comments in comments_data.items():
            for comment in comments:
                replies = comment.get('replies', [])
                for reply in replies:
                    nickname = reply.get('user_nickname', '匿名')
                    if nickname not in replier_count:
                        replier_count[nickname] = {
                            'nickname': nickname,
                            'avatar': reply.get('user_avatar', ''),
                            'count': 0
                        }
                    replier_count[nickname]['count'] += 1
        
        sorted_repliers = sorted(replier_count.values(), key=lambda x: x['count'], reverse=True)
        return sorted_repliers[:15]
    
    def _count_author_replies(self, comments_data: Dict[str, List[Dict]]) -> int:
        count = 0
        author_nickname = '张全蛋。'
        
        for aweme_id, comments in comments_data.items():
            for comment in comments:
                if comment.get('user_nickname') == author_nickname:
                    count += 1
                for reply in comment.get('replies', []):
                    if reply.get('user_nickname') == author_nickname:
                        count += 1
        
        return count
    
    def _count_participants(self, user_dir: str) -> int:
        avatars_dir = os.path.join(self.upload_dir, user_dir, 'avatars')
        if not os.path.exists(avatars_dir):
            return 0
        
        total_files = 0
        for year_dir in os.listdir(avatars_dir):
            year_path = os.path.join(avatars_dir, year_dir)
            if os.path.isdir(year_path):
                for f in os.listdir(year_path):
                    if os.path.isfile(os.path.join(year_path, f)):
                        total_files += 1
        
        return total_files
    
    def _get_latest_video_info(self, video_list: List[Dict]) -> Dict:
        if not video_list:
            return {'date': '', 'title': ''}
        latest = video_list[0]
        create_time = latest.get('create_time', 0)
        if create_time:
            try:
                dt = datetime.fromtimestamp(int(create_time), BEIJING_TZ)
                date_str = dt.strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                date_str = ''
        else:
            date_str = ''
        return {
            'date': date_str,
            'title': latest.get('desc', '')[:100] if latest.get('desc') else '[作者偷懒 没有写标题]'
        }
    
    def _generate_user_summary(self, video_list_data: Dict, active_repliers: List[Dict]):
        summary = {
            'total_videos': video_list_data['total_videos'],
            'total_comments': video_list_data['total_comments'],
            'active_repliers': active_repliers,
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        output_file = os.path.join(self.current_user_dir, 'summary.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)


def main():
    builder = SiteBuilder()
    builder.build()


if __name__ == '__main__':
    main()
